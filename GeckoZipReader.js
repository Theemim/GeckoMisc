// A Scratchpad snippet which extracts metadata and/or files from zip archives.
//
// Must be run in browser context.  You may have to "Enable browser chrome
// and add-on debugging toolboxes" in the Developer Toolbox Options, and in
// Scratchpad select Browser in the Environment menu. You can change those
// settings back to what they were when you are done.
//
// This version is synchronous and large archives may take a while (be patient).
//
// Changes in archive format/compression may mean that this snippet has to
// be executed in specific applications or versions in order to extract files
// from certain zip archives.  For example, this could not extract the files
// from Firefox 57 Nightly System Addon XPIs when executed in Firefox ESR
// 52.3.0.  However, it could extract the files when executed in Firefox 57
// Nightly.
//
// Based on:
//
// https://addons.mozilla.org/firefox/downloads/file/185232/unzip-0.11.63-fx.xpi
// https://dxr.mozilla.org/mozilla-release/source/toolkit/modules/ZipUtils.jsm
// https://developer.mozilla.org/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIZipReader
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

"use strict";

var options = {
  extractMetadata: false,
  extractFiles:    true,
  openDirWhenDone: false,
};

var geckoZipReader = {
  options: undefined,

  start: function (options) {
    this.options = options;
    if(typeof(Components) !== "object") {
      throw("Components is not an object.  Are you running in browser context?");
      return;
    }
    ["classes", "interfaces", "results", "utils"].forEach(function(p) {
      if(typeof(Components[p]) !== "object") {
        throw("Components." + p + " is not an object.  Are you running in browser context?");
        return;
      }
    });
    if(typeof(Services) === "undefined") {
      Components.utils.import("resource://gre/modules/Services.jsm");
      if(typeof(Services) !== "object") {
        throw("Can't import resource://gre/modules/Services.jsm");
        return;
      }
    }
    if(typeof(FileUtils) === "undefined") {
      Components.utils.import("resource://gre/modules/FileUtils.jsm");
      if(typeof(FileUtils) !== "object") {
        this.displayError("Can't import resource://gre/modules/FileUtils.jsm");
        return;
      }
    }
    this.openFilePicker();
  },

  openFilePicker: function () {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window, "Select zip archive", fp.modeOpen);
    fp.appendFilter("Zip archives", "*.zip; *.xpi; *.jar; *.ja; *.crx");
    fp.appendFilters(fp.filterAll);
    let self = this;
    let fpCallbackObj = {
      done: function(result) {
        if ((result === fp.returnOK) || (result === fp.returnReplace)) {
          self.processArchive(fp.file);
        }
      }
    };
    fp.open(fpCallbackObj);
  },

  processArchive: function(archiveFile) {
    let uri = Services.io.newFileURI(archiveFile);
    // url is a nsIURI;
    let url = uri.QueryInterface(Ci.nsIURL);
    if(this.options.extractMetadata) {
      let metadataFile = archiveFile.parent;
      metadataFile.append(url.fileBaseName + "-metadata.txt");
      metadataFile = this.uniqueFile(metadataFile);
      this.extractMetadata(archiveFile, metadataFile);
    }
    if(this.options.extractFiles) {
      let extractDir = archiveFile.parent;
      extractDir.append(url.fileBaseName);
      extractDir = this.uniqueFile(extractDir);
      this.extractFiles(archiveFile, extractDir);
    }
  },

  uniqueFile: function(aLocalFile) {
    let collisionCount = 0;
    while (aLocalFile.exists()) {
      collisionCount++;
      if (collisionCount == 1) {
        // Append "(2)" before the last dot in (or at the end of) the filename
        // special case .ext.gz etc files so we don't wind up with .tar(2).gz
        if (aLocalFile.leafName.match(/\.[^\.]{1,3}\.(gz|bz2|Z)$/i))
          aLocalFile.leafName = aLocalFile.leafName.replace(/\.[^\.]{1,3}\.(gz|bz2|Z)$/i, "(2)$&");
        else
          aLocalFile.leafName = aLocalFile.leafName.replace(/(\.[^\.]*)?$/, "(2)$&");
      }
      else {
        // replace the last (n) in the filename with (n+1)
        aLocalFile.leafName = aLocalFile.leafName.replace(/^(.*\()\d+\)/, "$1" + (collisionCount + 1) + ")");
      }
    }
    return aLocalFile;
  },

  extractFiles: function extractFiles(aZipFile, aDir) {
    // ToDo: extractFilesAsync
    function getTargetFile(aDir, entry) {
      let target = aDir.clone();
      entry.split("/").forEach(function(aPart) {
        target.append(aPart);
      });
      return target;
    }

    let fileExtractCompleted = false;
    let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
    try {
      zipReader.open(aZipFile);
    }
    catch(e) {
      this.displayError(aZipFile.path + "\n\n is corrupted or is not a ZIP file.", e);
      return;
    }

    try {
      // create directories first
      let entries = zipReader.findEntries("*/");
      while (entries.hasMore()) {
        let entryName = entries.getNext();
        let target = getTargetFile(aDir, entryName);
        if (!target.exists()) {
          try {
            target.create(Ci.nsIFile.DIRECTORY_TYPE, FileUtils.PERMS_DIRECTORY);
          }
          catch (e)
          {
            this.displayError("Failed to create directory:\n\n" + target.path, e);
            return;
          }
        }
      }
      entries = zipReader.findEntries(null);
      while (entries.hasMore()) {
        let entryName = entries.getNext();
        let target = getTargetFile(aDir, entryName);
        if (target.exists()) {
          continue;
        }

        try {
          zipReader.extract(entryName, target);
          target.permissions |= FileUtils.PERMS_FILE;
        }
        catch (e) {
          this.displayError("Failed to extract file:\n\n" + target.path, e);
          return;
        }
      }
      fileExtractCompleted = true;
    }
    catch(e) {
      this.displayError("Exception while extracting files", e);
    }
    finally {
      zipReader.close();
      if(fileExtractCompleted) {
        this.displayMsg("File extraction complete:\n\n" + aDir.path);
        if(this.options.openDirAfterFilesExtracted) {
          aDir.reveal();
        }
      }
      return;
    }
  },

  extractMetadata: function extractMetadata(aZipFile, aFile) {
    let metadataExtractCompleted = false;
    let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
    try {
      zipReader.open(aZipFile);
    }
    catch(e) {
      this.displayError(aZipFile.path + "\n\n is corrupted or is not a ZIP file.", e);
      return;
    }

    try {
      let entries = [];
      let enumerator = zipReader.findEntries(null);
      while (enumerator.hasMore()) {
        entries.push(enumerator.getNext());
      }
      entries.sort();

      // https://developer.mozilla.org/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIZipEntry
      // https://dxr.mozilla.org/mozilla-release/source/modules/libjar/zipstruct.h
      // https://www.pkware.com/documents/casestudies/APPNOTE.TXT
      let mozCompMethodDescs =  {
        0: "STORED",
        1: "SHRUNK",
        2: "REDUCED1",
        3: "REDUCED2",
        4: "REDUCED3",
        5: "REDUCED4",
        6: "IMPLODED",
        7: "TOKENIZED",
        8: "DEFLATED",
        9: "UNSUPPORTED",
        /* non-standard extension */
        129 : "MOZ_JAR_BROTLI",  // https://bugzilla.mozilla.org/show_bug.cgi?id=1355661
      };
      let outputStr = entries.length + " entries found:\n\n";
      entries.forEach(function(name) {
        let entry = zipReader.getEntry(name);
        let str = name + "\n";
        str += "   CompressionMethod:  " + entry.compression;
        if(mozCompMethodDescs.hasOwnProperty(entry.compression)) {
          str += " (" + mozCompMethodDescs[entry.compression] + ")";
        }
        str += "\n";
        str += "   compressedSize:     " + entry.size + "\n";
        str += "   uncompressedSize:   " + entry.realSize + "\n";
        str += "   isDirectory:        " + entry.isDirectory + "\n";
        str += "   isSynthetic:        " + entry.isSynthetic + "\n";
        str += "   lastModifiedTime:   " + entry.lastModifiedTime;
        let lmtDate = new Date(entry.lastModifiedTime/1000);
        str += " (" + lmtDate.toISOString() + ")\n";
        str += "   CRC32:              " + entry.CRC32 + "\n";
        try {
          zipReader.test(name);
          str += "   IntegrityCheck:     " + "Pass" + "\n";
        }
        catch(e) {
          str += "   IntegrityCheck:     " + "FAIL" + "\n";
        }
        str += "\n";
        outputStr += str;
      });
      if(this.writeFile(aFile, outputStr)) {
        metadataExtractCompleted = true;
      }
    }
    catch(e) {
      this.displayError("Exception while extracing metadata", e);
    }
    finally {
      zipReader.close();
      if(metadataExtractCompleted) {
        this.displayMsg("Metadata extraction complete:\n\n" + aFile.path);
      }
      return;
    }
  },

  writeFile: function(file, str) {
    let result = false;
    try {
      // ToDo:
      // let encoder = new TextEncoder();
      // let array = encoder.encode(str);
      // OS.File.writeAtomic(file.path, array, {tmpPath: file.path + ".tmp"}).then(
      //   function() {
      //     // Success;
      //   },
      //   function(ex) {
      //     // Failure
      //   }
      // );
      //
      // ToDo:
      // Remove nsIConverterOutputStream
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1347888
      // Provide chrome JS helpers for reading UTF-8 as string and writing string as UTF-8 file
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1353285
      let foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                               .createInstance(Components.interfaces.nsIFileOutputStream);
      foStream.init(file, 0x02 | 0x08 | 0x20, parseInt("0666", 8), 0);
      let converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
                                .createInstance(Components.interfaces.nsIConverterOutputStream);
      converter.init(foStream, "UTF-8", 0, 0);
      converter.writeString(str);
      converter.close();
      result = true;
    }
    catch(e if (e.result === Components.results.NS_ERROR_FILE_IS_LOCKED)) {
      this.displayError("Write failed because file is locked:\n\n" + file.path);
    }
    catch(e if (e.result === Components.results.NS_ERROR_FILE_READ_ONLY)) {
      this.displayError("Write failed because file is readonly:\n\n" + file.path);
    }
    catch(e if (e.result === Components.results.NS_ERROR_FILE_ACCESS_DENIED)) {
      this.displayError("Write failed because access is denied:\n\n" + file.path);
    }
    catch(e) {
      this.displayError("Can't create output file:\n\n" + file.path, e);
    }
    return(result);
  },

  displayMsg: function (msg) {
    Services.prompt.alert(null, "GeckoZipReader", msg + "\n\n");
  },

  displayError: function (msg, e) {
    if(typeof(e) !== "undefined") {
      msg += "\n\n" + e.toString() + "\n\nStack: " + e.stack;
    }
    Services.prompt.alert(null, "GeckoZipReader", msg + "\n\n");
  },
};

geckoZipReader.start(options);