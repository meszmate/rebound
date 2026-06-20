/**************************************************************************************************
 *
 * ADOBE SYSTEMS INCORPORATED
 * Copyright 2013-2021 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  Adobe permits you to use, modify, and distribute this file in accordance with the
 * terms of the Adobe license agreement accompanying it.  If you have received this file from a
 * source other than Adobe, then your use, modification, or distribution of it requires the prior
 * written permission of Adobe.
 *
 * CSInterface - v11.0.0  (vendored, unmodified API surface used by Rebound)
 *
 **************************************************************************************************/

/** Stores constants for the window types supported by the CSXS infrastructure. */
function CSXSWindowType() {}
CSXSWindowType._PANEL = "Panel";
CSXSWindowType._MODELESS = "Modeless";
CSXSWindowType._MODAL_DIALOG = "ModalDialog";

/** EvalScript error message */
var EvalScript_ErrMessage = "EvalScript error.";

/** @class Version - Defines a version number with major, minor, micro, and special components. */
function Version(major, minor, micro, special) {
  this.major = major;
  this.minor = minor;
  this.micro = micro;
  this.special = special;
}
Version.MAX_NUM = 999999999;

/** @class VersionBound - Defines a boundary for a version range. */
function VersionBound(version, inclusive) {
  this.version = version;
  this.inclusive = inclusive;
}

/** @class VersionRange - Defines a range of versions. */
function VersionRange(lowerBound, upperBound) {
  this.lowerBound = lowerBound;
  this.upperBound = upperBound;
}

/** @class Runtime - Represents a runtime related to the CEP infrastructure. */
function Runtime(name, version) {
  this.name = name;
  this.versionRange = version;
}

/** @class Extension - Encapsulates a CEP-based extension. */
function Extension(id, name, mainPath, basePath, windowType, width, height,
  minWidth, minHeight, maxWidth, maxHeight, defaultExtensionDataXml,
  specialExtensionDataXml, requiredRuntimeList, isAutoVisible, isPluginExtension) {
  this.id = id;
  this.name = name;
  this.mainPath = mainPath;
  this.basePath = basePath;
  this.windowType = windowType;
  this.width = width;
  this.height = height;
  this.minWidth = minWidth;
  this.minHeight = minHeight;
  this.maxWidth = maxWidth;
  this.maxHeight = maxHeight;
  this.defaultExtensionDataXml = defaultExtensionDataXml;
  this.specialExtensionDataXml = specialExtensionDataXml;
  this.requiredRuntimeList = requiredRuntimeList;
  this.isAutoVisible = isAutoVisible;
  this.isPluginExtension = isPluginExtension;
}

/** @class CSEvent - A standard JavaScript event, the base class for CEP events. */
function CSEvent(type, scope, appId, extensionId) {
  this.type = type;
  this.scope = scope;
  this.appId = appId;
  this.extensionId = extensionId;
  this.data = "";
}

/** @class SystemPath - Stores operating-system-specific location constants. */
function SystemPath() {}
SystemPath.USER_DATA = "userData";
SystemPath.COMMON_FILES = "commonFiles";
SystemPath.MY_DOCUMENTS = "myDocuments";
SystemPath.APPLICATION = "application";
SystemPath.EXTENSION = "extension";
SystemPath.HOST_APPLICATION = "hostApplication";

/** @class ColorType - Stores color-type constants. */
function ColorType() {}
ColorType.RGB = "rgb";
ColorType.GRADIENT = "gradient";
ColorType.NONE = "none";

/** @class RGBColor - Stores an RGB color with red, green, blue, and alpha values. */
function RGBColor(red, green, blue, alpha) {
  this.red = red;
  this.green = green;
  this.blue = blue;
  this.alpha = alpha;
}

/** @class GradientColor - A point for a gradient color. */
function GradientColor(type, direction, numStops, gradientStopList) {
  this.type = type;
  this.direction = direction;
  this.numStops = numStops;
  this.gradientStopList = gradientStopList;
}

/** @class UIColor - Stores a color for a UI control. */
function UIColor(type, antialiasLevel, color) {
  this.type = type;
  this.antialiasLevel = antialiasLevel;
  this.color = color;
}

/** @class AppSkinInfo - Stores window-skin info, such as colors and fonts, of the host app. */
function AppSkinInfo(baseFontFamily, baseFontSize, appBarBackgroundColor,
  panelBackgroundColor, appBarBackgroundColorSRGB, panelBackgroundColorSRGB, systemHighlightColor) {
  this.baseFontFamily = baseFontFamily;
  this.baseFontSize = baseFontSize;
  this.appBarBackgroundColor = appBarBackgroundColor;
  this.panelBackgroundColor = panelBackgroundColor;
  this.appBarBackgroundColorSRGB = appBarBackgroundColorSRGB;
  this.panelBackgroundColorSRGB = panelBackgroundColorSRGB;
  this.systemHighlightColor = systemHighlightColor;
}

/** @class HostEnvironment - Stores information about the environment in which the panel is loaded. */
function HostEnvironment(appName, appVersion, appLocale, appUILocale, appId,
  isAppOnline, appSkinInfo) {
  this.appName = appName;
  this.appVersion = appVersion;
  this.appLocale = appLocale;
  this.appUILocale = appUILocale;
  this.appId = appId;
  this.isAppOnline = isAppOnline;
  this.appSkinInfo = appSkinInfo;
}

/** @class HostCapabilities - Stores information about the host capabilities. */
function HostCapabilities(EXTENDED_PANEL_MENU, EXTENDED_PANEL_ICONS,
  DELEGATE_APE_ENGINE, SUPPORT_HTML_EXTENSIONS, DISABLE_FLASH_EXTENSIONS) {
  this.EXTENDED_PANEL_MENU = EXTENDED_PANEL_MENU;
  this.EXTENDED_PANEL_ICONS = EXTENDED_PANEL_ICONS;
  this.DELEGATE_APE_ENGINE = DELEGATE_APE_ENGINE;
  this.SUPPORT_HTML_EXTENSIONS = SUPPORT_HTML_EXTENSIONS;
  this.DISABLE_FLASH_EXTENSIONS = DISABLE_FLASH_EXTENSIONS;
}

/** @class ApiVersion - Stores current api version. */
function ApiVersion(major, minor, micro) {
  this.major = major;
  this.minor = minor;
  this.micro = micro;
}

/** @class MenuItemStatus - Stores flyout menu item status. */
function MenuItemStatus(menuItemLabel, enabled, checked) {
  this.menuItemLabel = menuItemLabel;
  this.enabled = enabled;
  this.checked = checked;
}

/** @class ContextMenuItemStatus - Stores the status of the context menu item. */
function ContextMenuItemStatus(menuItemID, enabled, checked) {
  this.menuItemID = menuItemID;
  this.enabled = enabled;
  this.checked = checked;
}

//------------------------------ CSInterface ------------------------------

/**
 * @class CSInterface
 * This is the entry point to the CEP extensibility infrastructure.
 * Instantiate this object and use it to:
 *  - Access information about the host application in which an extension is running.
 *  - Launch an extension.
 *  - Register interest in event notifications, and dispatch events.
 */
function CSInterface() {
  this.hostEnvironment = this.getHostEnvironment();
}

/** User can add this event listener to handle native application theme color changes. */
CSInterface.THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

/** The host environment data object. */
CSInterface.prototype.hostEnvironment = window.__adobe_cep__ ? JSON.parse(window.__adobe_cep__.getHostEnvironment()) : null;

/** Retrieves information about the host environment in which the extension is currently running. */
CSInterface.prototype.getHostEnvironment = function () {
  this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
  return this.hostEnvironment;
};

/** Loads binary file created by user. */
CSInterface.prototype.loadBinAsync = function (urlName, callback) {
  var xhr = new XMLHttpRequest();
  xhr.responseType = "arraybuffer";
  xhr.onload = function () {
    try {
      if (callback) callback.call(this, this.response);
    } catch (e) {}
  };
  xhr.onerror = function () {};
  xhr.open("GET", urlName, true);
  xhr.send();
};

/** Loads given binary file synchronously. */
CSInterface.prototype.loadBinSync = function (pathName) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", pathName, false);
  xhr.send();
  if (xhr.status === 200) return xhr.responseText;
  return "Error.";
};

/** Closes this extension. */
CSInterface.prototype.closeExtension = function () {
  window.__adobe_cep__.closeExtension();
};

/** Retrieves a path for which a constant is defined in the system. */
CSInterface.prototype.getSystemPath = function (pathType) {
  var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
  var OSVersion = this.getOSInformation();
  if (OSVersion.indexOf("Windows") >= 0) {
    path = path.replace("file:///", "");
  } else if (OSVersion.indexOf("Mac") >= 0) {
    path = path.replace("file://", "");
  }
  return path;
};

/** Evaluates a JavaScript script, which can use the JavaScript DOM of the host application. */
CSInterface.prototype.evalScript = function (script, callback) {
  if (callback === null || callback === undefined) {
    callback = function (result) {};
  }
  window.__adobe_cep__.evalScript(script, callback);
};

/** Retrieves the unique identifier of the application in which the extension is currently running. */
CSInterface.prototype.getApplicationID = function () {
  return this.hostEnvironment.appId;
};

/** Retrieves host capability information for the application in which the extension is currently running. */
CSInterface.prototype.getHostCapabilities = function () {
  return JSON.parse(window.__adobe_cep__.getHostCapabilities());
};

/** Triggers a CEP event programmatically. Yoy can use it to dispatch an event of a predefined type, or of a type you have defined. */
CSInterface.prototype.dispatchEvent = function (event) {
  if (typeof event.data === "object") {
    event.data = JSON.stringify(event.data);
  }
  window.__adobe_cep__.dispatchEvent(event);
};

/** Registers an interest in a CEP event of a particular type, and assigns an event handler. */
CSInterface.prototype.addEventListener = function (type, listener, obj) {
  window.__adobe_cep__.addEventListener(type, listener, obj);
};

/** Removes a registered event listener. */
CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  window.__adobe_cep__.removeEventListener(type, listener, obj);
};

/** Loads and launches another extension, or activates the extension if it is already loaded. */
CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
  window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

/** Retrieves the list of extensions currently loaded in the current host application. */
CSInterface.prototype.getExtensions = function (extensionIds) {
  var extensionIdsStr = JSON.stringify(extensionIds);
  var extensionsStr = window.__adobe_cep__.getExtensions(extensionIdsStr);
  var extensions = JSON.parse(extensionsStr);
  return extensions;
};

/** Retrieves network-related preferences. */
CSInterface.prototype.getNetworkPreferences = function () {
  var result = window.__adobe_cep__.getNetworkPreferences();
  var networkPre = JSON.parse(result);
  return networkPre;
};

/** Initializes the resource bundle for this extension with property values for the current application and locale. */
CSInterface.prototype.initResourceBundle = function () {
  var resourceBundle = JSON.parse(window.__adobe_cep__.initResourceBundle());
  var resElms = document.querySelectorAll("[data-locale]");
  for (var n = 0; n < resElms.length; n++) {
    var resEl = resElms[n];
    var resKey = resEl.getAttribute("data-locale");
    if (resKey) {
      for (var key in resourceBundle) {
        if (key.indexOf(resKey) === 0) {
          var resValue = resourceBundle[key];
          if (key.length === resKey.length) {
            resEl.innerHTML = resValue;
          } else if ("." === key.charAt(resKey.length)) {
            var attrKey = key.substring(resKey.length + 1);
            resEl[attrKey] = resValue;
          }
        }
      }
    }
  }
  return resourceBundle;
};

/** Writes installation information to a file. */
CSInterface.prototype.dumpInstallationInfo = function () {
  return window.__adobe_cep__.dumpInstallationInfo();
};

/** Retrieves version information for the current Operating System. */
CSInterface.prototype.getOSInformation = function () {
  var userAgent = navigator.userAgent;
  if ((navigator.platform === "Win32") || (navigator.platform === "Windows")) {
    var winVersion = "Windows";
    var winBit = "";
    if (userAgent.indexOf("Windows") > -1) {
      if (userAgent.indexOf("Windows NT 5.0") > -1) winVersion = "Windows 2000";
      else if (userAgent.indexOf("Windows NT 5.1") > -1) winVersion = "Windows XP";
      else if (userAgent.indexOf("Windows NT 5.2") > -1) winVersion = "Windows Server 2003";
      else if (userAgent.indexOf("Windows NT 6.0") > -1) winVersion = "Windows Vista";
      else if (userAgent.indexOf("Windows NT 6.1") > -1) winVersion = "Windows 7";
      else if (userAgent.indexOf("Windows NT 6.2") > -1) winVersion = "Windows 8";
      else if (userAgent.indexOf("Windows NT 6.3") > -1) winVersion = "Windows 8.1";
      else if (userAgent.indexOf("Windows NT 10") > -1) winVersion = "Windows 10";
      if (userAgent.indexOf("WOW64") > -1 || userAgent.indexOf("Win64") > -1) winBit = " 64-bit";
      else winBit = " 32-bit";
    }
    return winVersion + winBit;
  } else if ((navigator.platform === "MacIntel") || (navigator.platform === "Macintosh")) {
    var result = "Mac OS X";
    if (userAgent.indexOf("Mac OS X") > -1) {
      result = userAgent.substring(userAgent.indexOf("Mac OS X"), userAgent.indexOf(")"));
      result = result.replace(/_/g, ".");
    }
    return result;
  }
  return "Unknown Operation System";
};

/** Opens a page in the default system browser. */
CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  return cep.util.openURLInDefaultBrowser(url);
};

/** Retrieves extension ID. */
CSInterface.prototype.getExtensionID = function () {
  return window.__adobe_cep__.getExtensionId();
};

/** Retrieves the scale factor of screen. */
CSInterface.prototype.getScaleFactor = function () {
  return window.__adobe_cep__.getScaleFactor();
};

/** Retrieves the scale factor of Monitor. */
CSInterface.prototype.getMonitorScaleFactors = function () {
  return window.__adobe_cep__.getMonitorScaleFactors();
};

/** Set a handler to detect any changes of scale factor. Only works on Mac. */
CSInterface.prototype.setScaleFactorChangedHandler = function (handler) {
  window.__adobe_cep__.setScaleFactorChangedHandler(handler);
};

/** Retrieves current API version. */
CSInterface.prototype.getCurrentApiVersion = function () {
  var apiVersion = JSON.parse(window.__adobe_cep__.getCurrentApiVersion());
  return apiVersion;
};

/** Set panel flyout menu by an XML. */
CSInterface.prototype.setPanelFlyoutMenu = function (menu) {
  if ("string" !== typeof menu) return;
  window.__adobe_cep__.invokeSync("setPanelFlyoutMenu", menu);
};

/** Updates a menu item in the extension window's flyout menu, by setting the enabled and selection status. */
CSInterface.prototype.updatePanelMenuItem = function (menuItemLabel, enabled, checked) {
  var ret = false;
  if (this.getHostCapabilities().EXTENDED_PANEL_MENU) {
    var itemStatus = new MenuItemStatus(menuItemLabel, enabled, checked);
    ret = window.__adobe_cep__.invokeSync("updatePanelMenuItem", JSON.stringify(itemStatus));
  }
  return ret;
};

/** Set context menu by an XML string. */
CSInterface.prototype.setContextMenu = function (menu, callback) {
  if ("string" !== typeof menu) return;
  window.__adobe_cep__.invokeAsync("setContextMenu", menu, callback);
};

/** Set context menu by a JSON string. */
CSInterface.prototype.setContextMenuByJSON = function (menu, callback) {
  if ("string" !== typeof menu) return;
  window.__adobe_cep__.invokeAsync("setContextMenuByJSON", menu, callback);
};

/** Updates a context menu item by setting the enabled and selection status. */
CSInterface.prototype.updateContextMenuItem = function (menuItemID, enabled, checked) {
  var itemStatus = new ContextMenuItemStatus(menuItemID, enabled, checked);
  window.__adobe_cep__.invokeSync("updateContextMenuItem", JSON.stringify(itemStatus));
};

/** Get the visibility status of an extension window. */
CSInterface.prototype.isWindowVisible = function () {
  return window.__adobe_cep__.invokeSync("isWindowVisible", "");
};

/** Resize extension's content to the specified dimensions. */
CSInterface.prototype.resizeContent = function (width, height) {
  window.__adobe_cep__.resizeContent(width, height);
};

/** Register the invalid certificate callback for an extension. */
CSInterface.prototype.registerInvalidCertificateCallback = function (callback) {
  return window.__adobe_cep__.registerInvalidCertificateCallback(callback);
};

/** Register an interest in some key events to prevent them from being sent to the host application. */
CSInterface.prototype.registerKeyEventsInterest = function (keyEventsInterest) {
  return window.__adobe_cep__.registerKeyEventsInterest(keyEventsInterest);
};

/** Set the title of the extension window. */
CSInterface.prototype.setWindowTitle = function (title) {
  window.__adobe_cep__.invokeSync("setWindowTitle", title);
};

/** Get the title of the extension window. */
CSInterface.prototype.getWindowTitle = function () {
  return window.__adobe_cep__.invokeSync("getWindowTitle", "");
};
