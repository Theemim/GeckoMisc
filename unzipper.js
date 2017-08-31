// A Scratchpad snippet which extracts files from zip archives.
//
// This version is synchronous and large archives may take a while (be patient).
//
// Must be run in browser context.  You may have to "Enable browser chrome
// and add-on debugging toolboxes" in the Developer Toolbox Options, and in
// Scratchpad select Browser in the Environment menu. You can change those
// settings back to what they were when you are done.
//
// This could not unzip FF 57 System Addons when executed in FF ESR 52.3.0,
// but it could unzip them when executed in FF 57.  There might be other
// cases where this must be run in a specific or later version in order
// to unzip certain XPIs.
//
// Based on:
//
// https://addons.mozilla.org/firefox/downloads/file/185232/unzip-0.11.63-fx.xpi
// https://dxr.mozilla.org/mozilla-release/source/toolkit/modules/ZipUtils.jsm
// https://developer.mozilla.org/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIZipReader
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

"use strict";

var unzipper = {
  openWhenDone: false,

  start: function () {
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
    this.showPicker();
  },

  showPicker: function () {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window, "Select zip archive", fp.modeOpen);
    fp.appendFilter("Zip archives", "*.zip; *.xpi; *.jar; *.ja");
    fp.appendFilters(fp.filterAll);
    let fpCallbackObj = {
      done: function(result) {
        if ((result === fp.returnOK) || (result === fp.returnReplace)) {
          let file = fp.file;
          let uri = Services.io.newFileURI(file);
          // url is a nsIURI;
          let url = uri.QueryInterface(Ci.nsIURL);
          let name = url.fileBaseName;
          let parent = file.parent;
          parent.append(name);
          let extractDir = unzipper.uniqueFile(parent);
          unzipper.extractFiles(file,extractDir);
        }
      }
    };
    fp.open(fpCallbackObj);
  },

  uniqueFile: function(aLocalFile)
  {
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
    function getTargetFile(aDir, entry) {
      let target = aDir.clone();
      entry.split("/").forEach(function(aPart) {
        target.append(aPart);
      });
      return target;
    }

    let unzipCompleted = false;
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
      unzipCompleted = true;
    }
    catch(e) {
      this.displayError("Exception while unzipping", e);
    }
    finally {
      zipReader.close();
      if(unzipCompleted) {
        this.displayMsg("Extraction complete:\n\n" + aDir.path);
        if(this.openWhenDone) {
          aDir.reveal();
        }
      }
      return;
    }
  },

  displayMsg: function (msg) {
    Services.prompt.alert(null, "Unzipper", msg + "\n\n");
  },

  displayError: function (msg, e) {
    if(typeof(e) !== "undefined") {
      msg += "\n\n" + e.toString() + "\n\nStack: " + e.stack;
    }
    Services.prompt.alert(null, "Unzipper", msg + "\n\n");
  },
};

unzipper.start();