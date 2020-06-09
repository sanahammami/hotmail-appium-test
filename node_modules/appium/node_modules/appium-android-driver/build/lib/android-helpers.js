"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard");

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.SETTINGS_HELPER_PKG_ID = exports.helpers = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _path = _interopRequireDefault(require("path"));

var _teen_process = require("teen_process");

var _asyncbox = require("asyncbox");

var _logger = _interopRequireDefault(require("./logger"));

var _appiumSupport = require("appium-support");

var _ioAppium = require("io.appium.settings");

var _bootstrap = _interopRequireDefault(require("./bootstrap"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _appiumAdb = _interopRequireDefault(require("appium-adb"));

var _unlockHelpers = _interopRequireWildcard(require("./unlock-helpers"));

var _os = require("os");

const PACKAGE_INSTALL_TIMEOUT = 90000;
const CHROME_BROWSER_PACKAGE_ACTIVITY = {
  chrome: {
    pkg: 'com.android.chrome',
    activity: 'com.google.android.apps.chrome.Main'
  },
  chromium: {
    pkg: 'org.chromium.chrome.shell',
    activity: '.ChromeShellActivity'
  },
  chromebeta: {
    pkg: 'com.chrome.beta',
    activity: 'com.google.android.apps.chrome.Main'
  },
  browser: {
    pkg: 'com.android.browser',
    activity: 'com.android.browser.BrowserActivity'
  },
  'chromium-browser': {
    pkg: 'org.chromium.chrome',
    activity: 'com.google.android.apps.chrome.Main'
  },
  'chromium-webview': {
    pkg: 'org.chromium.webview_shell',
    activity: 'org.chromium.webview_shell.WebViewBrowserActivity'
  },
  default: {
    pkg: 'com.android.chrome',
    activity: 'com.google.android.apps.chrome.Main'
  }
};
const SETTINGS_HELPER_PKG_ID = 'io.appium.settings';
exports.SETTINGS_HELPER_PKG_ID = SETTINGS_HELPER_PKG_ID;
const SETTINGS_HELPER_MAIN_ACTIVITY = '.Settings';
const SETTINGS_HELPER_UNLOCK_ACTIVITY = '.Unlock';
let helpers = {};
exports.helpers = helpers;

helpers.createBaseADB = async function createBaseADB(opts = {}) {
  const {
    adbPort,
    suppressKillServer,
    remoteAdbHost,
    clearDeviceLogsOnStart,
    adbExecTimeout,
    useKeystore,
    keystorePath,
    keystorePassword,
    keyAlias,
    keyPassword,
    remoteAppsCacheLimit,
    buildToolsVersion
  } = opts;
  return await _appiumAdb.default.createADB({
    adbPort,
    suppressKillServer,
    remoteAdbHost,
    clearDeviceLogsOnStart,
    adbExecTimeout,
    useKeystore,
    keystorePath,
    keystorePassword,
    keyAlias,
    keyPassword,
    remoteAppsCacheLimit,
    buildToolsVersion
  });
};

helpers.getJavaVersion = async function getJavaVersion(logVersion = true) {
  let stderr;

  try {
    ({
      stderr
    } = await (0, _teen_process.exec)('java', ['-version']));
  } catch (e) {
    throw new Error(`Could not get the Java version. Is Java installed? Original error: ${e.stderr}`);
  }

  const versionMatch = /(java|openjdk)\s+version.+?([0-9._]+)/i.exec(stderr);

  if (!versionMatch) {
    throw new Error(`Could not parse Java version. Is Java installed? Original output: ${stderr}`);
  }

  if (logVersion) {
    _logger.default.info(`Java version is: ${versionMatch[2]}`);
  }

  return versionMatch[2];
};

helpers.prepareEmulator = async function prepareEmulator(adb, opts) {
  let {
    avd,
    avdArgs,
    language,
    locale,
    avdLaunchTimeout,
    avdReadyTimeout
  } = opts;

  if (!avd) {
    throw new Error('Cannot launch AVD without AVD name');
  }

  let avdName = avd.replace('@', '');
  let runningAVD = await adb.getRunningAVD(avdName);

  if (runningAVD !== null) {
    if (avdArgs && avdArgs.toLowerCase().indexOf('-wipe-data') > -1) {
      _logger.default.debug(`Killing '${avdName}' because it needs to be wiped at start.`);

      await adb.killEmulator(avdName);
    } else {
      _logger.default.debug('Not launching AVD because it is already running.');

      return;
    }
  }

  avdArgs = this.prepareAVDArgs(opts, adb, avdArgs);
  await adb.launchAVD(avd, avdArgs, language, locale, avdLaunchTimeout, avdReadyTimeout);
};

helpers.prepareAVDArgs = function prepareAVDArgs(opts, adb, avdArgs) {
  let args = avdArgs ? [avdArgs] : [];

  if (!_lodash.default.isUndefined(opts.networkSpeed)) {
    let networkSpeed = this.ensureNetworkSpeed(adb, opts.networkSpeed);
    args.push('-netspeed', networkSpeed);
  }

  if (opts.isHeadless) {
    args.push('-no-window');
  }

  return args.join(' ');
};

helpers.ensureNetworkSpeed = function ensureNetworkSpeed(adb, networkSpeed) {
  if (_lodash.default.values(adb.NETWORK_SPEED).indexOf(networkSpeed) !== -1) {
    return networkSpeed;
  }

  _logger.default.warn(`Wrong network speed param ${networkSpeed}, using default: full. Supported values: ${_lodash.default.values(adb.NETWORK_SPEED)}`);

  return adb.NETWORK_SPEED.FULL;
};

helpers.ensureDeviceLocale = async function ensureDeviceLocale(adb, language, country, script = null) {
  if (!_lodash.default.isString(language) && !_lodash.default.isString(country)) {
    _logger.default.warn(`setDeviceLanguageCountry requires language or country.`);

    _logger.default.warn(`Got language: '${language}' and country: '${country}'`);

    return;
  }

  await adb.setDeviceLanguageCountry(language, country, script);

  if (!(await adb.ensureCurrentLocale(language, country, script))) {
    const message = script ? `language: ${language}, country: ${country} and script: ${script}` : `language: ${language} and country: ${country}`;
    throw new Error(`Failed to set ${message}`);
  }
};

helpers.getDeviceInfoFromCaps = async function getDeviceInfoFromCaps(opts = {}) {
  const adb = await helpers.createBaseADB(opts);
  let udid = opts.udid;
  let emPort = null;

  if (opts.avd) {
    await helpers.prepareEmulator(adb, opts);
    udid = adb.curDeviceId;
    emPort = adb.emulatorPort;
  } else {
    _logger.default.info('Retrieving device list');

    let devices = await adb.getDevicesWithRetry();

    if (udid) {
      if (!_lodash.default.includes(_lodash.default.map(devices, 'udid'), udid)) {
        _logger.default.errorAndThrow(`Device ${udid} was not in the list of connected devices`);
      }

      emPort = adb.getPortFromEmulatorString(udid);
    } else if (opts.platformVersion) {
      opts.platformVersion = `${opts.platformVersion}`.trim();

      const platformVersion = _appiumSupport.util.coerceVersion(opts.platformVersion, false);

      if (!platformVersion) {
        _logger.default.errorAndThrow(`The provided platform version value '${platformVersion}' ` + `cannot be coerced to a valid version number`);
      }

      _logger.default.info(`Looking for a device with Android '${opts.platformVersion}'`);

      const availDevices = [];
      let partialMatchCandidate = null;

      const extractVersionDigits = versionStr => {
        const match = /(\d+)\.?(\d+)?/.exec(versionStr);
        return match ? match.slice(1) : [];
      };

      const [majorPlatformVersion, minorPlatformVersion] = extractVersionDigits(platformVersion);

      for (const device of devices) {
        await adb.setDeviceId(device.udid);
        const rawDeviceOS = await adb.getPlatformVersion();
        availDevices.push(`${device.udid} (${rawDeviceOS})`);

        const deviceOS = _appiumSupport.util.coerceVersion(rawDeviceOS, false);

        if (!deviceOS) {
          continue;
        }

        if (_appiumSupport.util.compareVersions(deviceOS, '==', platformVersion)) {
          udid = device.udid;
          break;
        }

        const [majorDeviceVersion, minorDeviceVersion] = extractVersionDigits(deviceOS);

        if (!opts.platformVersion.includes('.') && majorPlatformVersion === majorDeviceVersion || majorPlatformVersion === majorDeviceVersion && minorPlatformVersion === minorDeviceVersion) {
          if (partialMatchCandidate && _appiumSupport.util.compareVersions(deviceOS, '>', _lodash.default.values(partialMatchCandidate)[0]) || !partialMatchCandidate) {
            partialMatchCandidate = {
              [device.udid]: deviceOS
            };
          }
        }
      }

      if (!udid && partialMatchCandidate) {
        udid = _lodash.default.keys(partialMatchCandidate)[0];
        await adb.setDeviceId(udid);
      }

      if (!udid) {
        _logger.default.errorAndThrow(`Unable to find an active device or emulator ` + `with OS ${opts.platformVersion}. The following are available: ` + availDevices.join(', '));
      }

      emPort = adb.getPortFromEmulatorString(udid);
    } else {
      udid = devices[0].udid;
      emPort = adb.getPortFromEmulatorString(udid);
    }
  }

  _logger.default.info(`Using device: ${udid}`);

  return {
    udid,
    emPort
  };
};

helpers.createADB = async function createADB(opts = {}) {
  const {
    udid,
    emPort
  } = opts;
  const adb = await helpers.createBaseADB(opts);
  adb.setDeviceId(udid);

  if (emPort) {
    adb.setEmulatorPort(emPort);
  }

  return adb;
};

helpers.validatePackageActivityNames = function validatePackageActivityNames(opts) {
  for (const key of ['appPackage', 'appActivity', 'appWaitPackage', 'appWaitActivity']) {
    const name = opts[key];

    if (!name) {
      continue;
    }

    const match = /([^\w.*,])+/.exec(name);

    if (!match) {
      continue;
    }

    _logger.default.warn(`Capability '${key}' is expected to only include latin letters, digits, underscore, dot, comma and asterisk characters.`);

    _logger.default.warn(`Current value '${name}' has non-matching character at index ${match.index}: '${name.substring(0, match.index + 1)}'`);
  }
};

helpers.getLaunchInfo = async function getLaunchInfo(adb, opts) {
  let {
    app,
    appPackage,
    appActivity,
    appWaitPackage,
    appWaitActivity
  } = opts;

  if (!app) {
    _logger.default.warn('No app sent in, not parsing package/activity');

    return;
  }

  this.validatePackageActivityNames(opts);

  if (appPackage && appActivity) {
    return;
  }

  _logger.default.debug('Parsing package and activity from app manifest');

  let {
    apkPackage,
    apkActivity
  } = await adb.packageAndLaunchActivityFromManifest(app);

  if (apkPackage && !appPackage) {
    appPackage = apkPackage;
  }

  if (!appWaitPackage) {
    appWaitPackage = appPackage;
  }

  if (apkActivity && !appActivity) {
    appActivity = apkActivity;
  }

  if (!appWaitActivity) {
    appWaitActivity = appActivity;
  }

  _logger.default.debug(`Parsed package and activity are: ${apkPackage}/${apkActivity}`);

  return {
    appPackage,
    appWaitPackage,
    appActivity,
    appWaitActivity
  };
};

helpers.resetApp = async function resetApp(adb, opts = {}) {
  const {
    app,
    appPackage,
    fastReset,
    fullReset,
    androidInstallTimeout = PACKAGE_INSTALL_TIMEOUT,
    autoGrantPermissions,
    allowTestPackages
  } = opts;

  if (!appPackage) {
    throw new Error("'appPackage' option is required");
  }

  const isInstalled = await adb.isAppInstalled(appPackage);

  if (isInstalled) {
    try {
      await adb.forceStop(appPackage);
    } catch (ign) {}

    if (!fullReset && fastReset) {
      const output = await adb.clear(appPackage);

      if (_lodash.default.isString(output) && output.toLowerCase().includes('failed')) {
        throw new Error(`Cannot clear the application data of '${appPackage}'. Original error: ${output}`);
      }

      if (autoGrantPermissions) {
        try {
          await adb.grantAllPermissions(appPackage);
        } catch (error) {
          _logger.default.error(`Unable to grant permissions requested. Original error: ${error.message}`);
        }
      }

      _logger.default.debug(`Performed fast reset on the installed '${appPackage}' application (stop and clear)`);

      return;
    }
  }

  if (!app) {
    throw new Error("'app' option is required for reinstall");
  }

  _logger.default.debug(`Running full reset on '${appPackage}' (reinstall)`);

  if (isInstalled) {
    await adb.uninstallApk(appPackage);
  }

  await adb.install(app, {
    grantPermissions: autoGrantPermissions,
    timeout: androidInstallTimeout,
    allowTestPackages
  });
};

helpers.installApk = async function installApk(adb, opts = {}) {
  const {
    app,
    appPackage,
    fastReset,
    fullReset,
    androidInstallTimeout = PACKAGE_INSTALL_TIMEOUT,
    autoGrantPermissions,
    allowTestPackages,
    enforceAppInstall
  } = opts;

  if (!app || !appPackage) {
    throw new Error("'app' and 'appPackage' options are required");
  }

  if (fullReset) {
    await this.resetApp(adb, opts);
    return;
  }

  const {
    appState,
    wasUninstalled
  } = await adb.installOrUpgrade(app, appPackage, {
    grantPermissions: autoGrantPermissions,
    timeout: androidInstallTimeout,
    allowTestPackages,
    enforceCurrentBuild: enforceAppInstall
  });
  const isInstalledOverExistingApp = !wasUninstalled && appState !== adb.APP_INSTALL_STATE.NOT_INSTALLED;

  if (fastReset && isInstalledOverExistingApp) {
    _logger.default.info(`Performing fast reset on '${appPackage}'`);

    await this.resetApp(adb, opts);
  }
};

helpers.installOtherApks = async function installOtherApks(otherApps, adb, opts) {
  let {
    androidInstallTimeout = PACKAGE_INSTALL_TIMEOUT,
    autoGrantPermissions,
    allowTestPackages
  } = opts;
  await _bluebird.default.all(otherApps.map(otherApp => {
    _logger.default.debug(`Installing app: ${otherApp}`);

    return adb.installOrUpgrade(otherApp, null, {
      grantPermissions: autoGrantPermissions,
      timeout: androidInstallTimeout,
      allowTestPackages
    });
  }));
};

helpers.uninstallOtherPackages = async function uninstallOtherPackages(adb, appPackages, filterPackages = []) {
  if (appPackages.includes('*')) {
    _logger.default.debug('Uninstall third party packages');

    appPackages = await this.getThirdPartyPackages(adb, filterPackages);
  }

  _logger.default.debug(`Uninstalling packages: ${appPackages}`);

  await _bluebird.default.all(appPackages.map(appPackage => adb.uninstallApk(appPackage)));
};

helpers.getThirdPartyPackages = async function getThirdPartyPackages(adb, filterPackages = []) {
  try {
    const packagesString = await adb.shell(['pm', 'list', 'packages', '-3']);
    const appPackagesArray = packagesString.trim().replace(/package:/g, '').split(_os.EOL);

    _logger.default.debug(`'${appPackagesArray}' filtered with '${filterPackages}'`);

    return _lodash.default.difference(appPackagesArray, filterPackages);
  } catch (err) {
    _logger.default.warn(`Unable to get packages with 'adb shell pm list packages -3': ${err.message}`);

    return [];
  }
};

helpers.initUnicodeKeyboard = async function initUnicodeKeyboard(adb) {
  _logger.default.debug('Enabling Unicode keyboard support');

  let defaultIME = await adb.defaultIME();

  _logger.default.debug(`Unsetting previous IME ${defaultIME}`);

  const appiumIME = `${SETTINGS_HELPER_PKG_ID}/.UnicodeIME`;

  _logger.default.debug(`Setting IME to '${appiumIME}'`);

  await adb.enableIME(appiumIME);
  await adb.setIME(appiumIME);
  return defaultIME;
};

helpers.setMockLocationApp = async function setMockLocationApp(adb, app) {
  try {
    if ((await adb.getApiLevel()) < 23) {
      await adb.shell(['settings', 'put', 'secure', 'mock_location', '1']);
    } else {
      await adb.shell(['appops', 'set', app, 'android:mock_location', 'allow']);
    }
  } catch (err) {
    _logger.default.warn(`Unable to set mock location for app '${app}': ${err.message}`);
  }
};

helpers.installHelperApp = async function installHelperApp(adb, apkPath, packageId) {
  await (0, _asyncbox.retry)(2, async function retryInstallHelperApp() {
    await adb.installOrUpgrade(apkPath, packageId, {
      grantPermissions: true
    });
  });
};

helpers.pushSettingsApp = async function pushSettingsApp(adb, throwError = false) {
  _logger.default.debug('Pushing settings apk to device...');

  try {
    await helpers.installHelperApp(adb, _ioAppium.path, SETTINGS_HELPER_PKG_ID, throwError);
  } catch (err) {
    if (throwError) {
      throw err;
    }

    _logger.default.warn(`Ignored error while installing '${_ioAppium.path}': ` + `'${err.message}'. Features that rely on this helper ` + 'require the apk such as toggle WiFi and getting location ' + 'will raise an error if you try to use them.');
  }

  if (await adb.processExists(SETTINGS_HELPER_PKG_ID)) {
    _logger.default.debug(`${SETTINGS_HELPER_PKG_ID} is already running. ` + `There is no need to reset its permissions.`);

    return;
  }

  if ((await adb.getApiLevel()) <= 23) {
    _logger.default.info('Granting android.permission.SET_ANIMATION_SCALE, CHANGE_CONFIGURATION, ACCESS_FINE_LOCATION by pm grant');

    await adb.grantPermissions(SETTINGS_HELPER_PKG_ID, ['android.permission.SET_ANIMATION_SCALE', 'android.permission.CHANGE_CONFIGURATION', 'android.permission.ACCESS_FINE_LOCATION']);
  }

  try {
    await adb.startApp({
      pkg: SETTINGS_HELPER_PKG_ID,
      activity: SETTINGS_HELPER_MAIN_ACTIVITY,
      action: 'android.intent.action.MAIN',
      category: 'android.intent.category.LAUNCHER',
      stopApp: false,
      waitForLaunch: false
    });
    await (0, _asyncbox.waitForCondition)(async () => await adb.processExists(SETTINGS_HELPER_PKG_ID), {
      waitMs: 5000,
      intervalMs: 300
    });
  } catch (err) {
    const message = `Failed to launch Appium Settings app: ${err.message}`;
    err.message = message;

    _logger.default.warn(message);

    if (throwError) {
      throw err;
    }
  }
};

helpers.pushStrings = async function pushStrings(language, adb, opts) {
  const remoteDir = '/data/local/tmp';
  const stringsJson = 'strings.json';

  const remoteFile = _path.default.posix.resolve(remoteDir, stringsJson);

  await adb.rimraf(remoteFile);
  let app;

  try {
    app = opts.app || (await adb.pullApk(opts.appPackage, opts.tmpDir));
  } catch (err) {
    _logger.default.info(`Failed to pull an apk from '${opts.appPackage}' to '${opts.tmpDir}'. Original error: ${err.message}`);
  }

  if (_lodash.default.isEmpty(opts.appPackage) || !(await _appiumSupport.fs.exists(app))) {
    _logger.default.debug(`No app or package specified. Returning empty strings`);

    return {};
  }

  const stringsTmpDir = _path.default.resolve(opts.tmpDir, opts.appPackage);

  try {
    _logger.default.debug('Extracting strings from apk', app, language, stringsTmpDir);

    const {
      apkStrings,
      localPath
    } = await adb.extractStringsFromApk(app, language, stringsTmpDir);
    await adb.push(localPath, remoteDir);
    return apkStrings;
  } catch (err) {
    _logger.default.warn(`Could not get strings, continuing anyway. Original error: ${err.message}`);

    await adb.shell('echo', [`'{}' > ${remoteFile}`]);
  } finally {
    await _appiumSupport.fs.rimraf(stringsTmpDir);
  }

  return {};
};

helpers.unlockWithUIAutomation = async function unlockWithUIAutomation(driver, adb, unlockCapabilities) {
  let unlockType = unlockCapabilities.unlockType;

  if (!_unlockHelpers.default.isValidUnlockType(unlockType)) {
    throw new Error(`Invalid unlock type ${unlockType}`);
  }

  let unlockKey = unlockCapabilities.unlockKey;

  if (!_unlockHelpers.default.isValidKey(unlockType, unlockKey)) {
    throw new Error(`Missing unlockKey ${unlockKey} capability for unlockType ${unlockType}`);
  }

  const unlockMethod = {
    [_unlockHelpers.PIN_UNLOCK]: _unlockHelpers.default.pinUnlock,
    [_unlockHelpers.PASSWORD_UNLOCK]: _unlockHelpers.default.passwordUnlock,
    [_unlockHelpers.PATTERN_UNLOCK]: _unlockHelpers.default.patternUnlock,
    [_unlockHelpers.FINGERPRINT_UNLOCK]: _unlockHelpers.default.fingerprintUnlock
  }[unlockType];
  await unlockMethod(adb, driver, unlockCapabilities);
};

helpers.unlockWithHelperApp = async function unlockWithHelperApp(adb) {
  _logger.default.info('Unlocking screen');

  let firstRun = true;
  await (0, _asyncbox.retry)(3, async function launchHelper() {
    if (firstRun) {
      firstRun = false;
    } else {
      try {
        if (!(await adb.isScreenLocked())) {
          return;
        }
      } catch (e) {
        _logger.default.warn(`Error in isScreenLocked: ${e.message}`);

        _logger.default.warn('"adb shell dumpsys window" command has timed out.');

        _logger.default.warn('The reason of this timeout is the delayed adb response. Resetting adb server can improve it.');
      }
    }

    _logger.default.info(`Launching ${SETTINGS_HELPER_UNLOCK_ACTIVITY}`);

    await adb.shell(['am', 'start', '-n', `${SETTINGS_HELPER_PKG_ID}/${SETTINGS_HELPER_UNLOCK_ACTIVITY}`, '-c', 'android.intent.category.LAUNCHER', '-a', 'android.intent.action.MAIN', '-f', '0x10200000']);
    await _bluebird.default.delay(1000);
  });
};

helpers.unlock = async function unlock(driver, adb, capabilities) {
  if (!(await adb.isScreenLocked())) {
    _logger.default.info('Screen already unlocked, doing nothing');

    return;
  }

  _logger.default.debug('Screen is locked, trying to unlock');

  if (_lodash.default.isUndefined(capabilities.unlockType)) {
    _logger.default.warn('Using app unlock, this is going to be deprecated!');

    await helpers.unlockWithHelperApp(adb);
  } else {
    await helpers.unlockWithUIAutomation(driver, adb, {
      unlockType: capabilities.unlockType,
      unlockKey: capabilities.unlockKey
    });
    await helpers.verifyUnlock(adb);
  }
};

helpers.verifyUnlock = async function verifyUnlock(adb) {
  await (0, _asyncbox.retryInterval)(2, 1000, async () => {
    if (await adb.isScreenLocked()) {
      throw new Error('Screen did not unlock successfully, retrying');
    }

    _logger.default.debug('Screen unlocked successfully');
  });
};

helpers.initDevice = async function initDevice(adb, opts) {
  if (opts.skipDeviceInitialization) {
    _logger.default.info(`'skipDeviceInitialization' is set. Skipping device initialization.`);
  } else {
    await adb.waitForDevice();
    const shouldThrowError = opts.language || opts.locale || opts.localeScript || opts.unicodeKeyboard || opts.disableWindowAnimation || !opts.skipUnlock;
    await helpers.pushSettingsApp(adb, shouldThrowError);
  }

  if (!opts.avd) {
    await helpers.setMockLocationApp(adb, SETTINGS_HELPER_PKG_ID);
  }

  if (opts.language || opts.locale) {
    await helpers.ensureDeviceLocale(adb, opts.language, opts.locale, opts.localeScript);
  }

  if (opts.skipLogcatCapture) {
    _logger.default.info(`'skipLogcatCapture' is set. Skipping starting logcat capture.`);
  } else {
    await adb.startLogcat();
  }

  if (opts.unicodeKeyboard) {
    return await helpers.initUnicodeKeyboard(adb);
  }
};

helpers.removeNullProperties = function removeNullProperties(obj) {
  for (let key of _lodash.default.keys(obj)) {
    if (_lodash.default.isNull(obj[key]) || _lodash.default.isUndefined(obj[key])) {
      delete obj[key];
    }
  }
};

helpers.truncateDecimals = function truncateDecimals(number, digits) {
  let multiplier = Math.pow(10, digits),
      adjustedNum = number * multiplier,
      truncatedNum = Math[adjustedNum < 0 ? 'ceil' : 'floor'](adjustedNum);
  return truncatedNum / multiplier;
};

helpers.isChromeBrowser = function isChromeBrowser(browser) {
  return _lodash.default.includes(Object.keys(CHROME_BROWSER_PACKAGE_ACTIVITY), (browser || '').toLowerCase());
};

helpers.getChromePkg = function getChromePkg(browser) {
  return CHROME_BROWSER_PACKAGE_ACTIVITY[browser.toLowerCase()] || CHROME_BROWSER_PACKAGE_ACTIVITY.default;
};

helpers.removeAllSessionWebSocketHandlers = async function removeAllSessionWebSocketHandlers(server, sessionId) {
  if (!server || !_lodash.default.isFunction(server.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await server.getWebSocketHandlers(sessionId);

  for (const pathname of _lodash.default.keys(activeHandlers)) {
    await server.removeWebSocketHandler(pathname);
  }
};

helpers.parseArray = function parseArray(cap) {
  let parsedCaps;

  try {
    parsedCaps = JSON.parse(cap);
  } catch (ign) {}

  if (_lodash.default.isArray(parsedCaps)) {
    return parsedCaps;
  } else if (_lodash.default.isString(cap)) {
    return [cap];
  }

  throw new Error(`must provide a string or JSON Array; received ${cap}`);
};

helpers.validateDesiredCaps = function validateDesiredCaps(caps) {
  if (caps.browserName) {
    if (caps.app) {
      _logger.default.warn(`The desired capabilities should generally not include both an 'app' and a 'browserName'`);
    }

    if (caps.appPackage) {
      _logger.default.errorAndThrow(`The desired should not include both of an 'appPackage' and a 'browserName'`);
    }
  }

  if (caps.uninstallOtherPackages) {
    try {
      this.parseArray(caps.uninstallOtherPackages);
    } catch (e) {
      _logger.default.errorAndThrow(`Could not parse "uninstallOtherPackages" capability: ${e.message}`);
    }
  }

  return true;
};

helpers.bootstrap = _bootstrap.default;
helpers.unlocker = _unlockHelpers.default;
var _default = helpers;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9hbmRyb2lkLWhlbHBlcnMuanMiXSwibmFtZXMiOlsiUEFDS0FHRV9JTlNUQUxMX1RJTUVPVVQiLCJDSFJPTUVfQlJPV1NFUl9QQUNLQUdFX0FDVElWSVRZIiwiY2hyb21lIiwicGtnIiwiYWN0aXZpdHkiLCJjaHJvbWl1bSIsImNocm9tZWJldGEiLCJicm93c2VyIiwiZGVmYXVsdCIsIlNFVFRJTkdTX0hFTFBFUl9QS0dfSUQiLCJTRVRUSU5HU19IRUxQRVJfTUFJTl9BQ1RJVklUWSIsIlNFVFRJTkdTX0hFTFBFUl9VTkxPQ0tfQUNUSVZJVFkiLCJoZWxwZXJzIiwiY3JlYXRlQmFzZUFEQiIsIm9wdHMiLCJhZGJQb3J0Iiwic3VwcHJlc3NLaWxsU2VydmVyIiwicmVtb3RlQWRiSG9zdCIsImNsZWFyRGV2aWNlTG9nc09uU3RhcnQiLCJhZGJFeGVjVGltZW91dCIsInVzZUtleXN0b3JlIiwia2V5c3RvcmVQYXRoIiwia2V5c3RvcmVQYXNzd29yZCIsImtleUFsaWFzIiwia2V5UGFzc3dvcmQiLCJyZW1vdGVBcHBzQ2FjaGVMaW1pdCIsImJ1aWxkVG9vbHNWZXJzaW9uIiwiQURCIiwiY3JlYXRlQURCIiwiZ2V0SmF2YVZlcnNpb24iLCJsb2dWZXJzaW9uIiwic3RkZXJyIiwiZSIsIkVycm9yIiwidmVyc2lvbk1hdGNoIiwiZXhlYyIsImxvZ2dlciIsImluZm8iLCJwcmVwYXJlRW11bGF0b3IiLCJhZGIiLCJhdmQiLCJhdmRBcmdzIiwibGFuZ3VhZ2UiLCJsb2NhbGUiLCJhdmRMYXVuY2hUaW1lb3V0IiwiYXZkUmVhZHlUaW1lb3V0IiwiYXZkTmFtZSIsInJlcGxhY2UiLCJydW5uaW5nQVZEIiwiZ2V0UnVubmluZ0FWRCIsInRvTG93ZXJDYXNlIiwiaW5kZXhPZiIsImRlYnVnIiwia2lsbEVtdWxhdG9yIiwicHJlcGFyZUFWREFyZ3MiLCJsYXVuY2hBVkQiLCJhcmdzIiwiXyIsImlzVW5kZWZpbmVkIiwibmV0d29ya1NwZWVkIiwiZW5zdXJlTmV0d29ya1NwZWVkIiwicHVzaCIsImlzSGVhZGxlc3MiLCJqb2luIiwidmFsdWVzIiwiTkVUV09SS19TUEVFRCIsIndhcm4iLCJGVUxMIiwiZW5zdXJlRGV2aWNlTG9jYWxlIiwiY291bnRyeSIsInNjcmlwdCIsImlzU3RyaW5nIiwic2V0RGV2aWNlTGFuZ3VhZ2VDb3VudHJ5IiwiZW5zdXJlQ3VycmVudExvY2FsZSIsIm1lc3NhZ2UiLCJnZXREZXZpY2VJbmZvRnJvbUNhcHMiLCJ1ZGlkIiwiZW1Qb3J0IiwiY3VyRGV2aWNlSWQiLCJlbXVsYXRvclBvcnQiLCJkZXZpY2VzIiwiZ2V0RGV2aWNlc1dpdGhSZXRyeSIsImluY2x1ZGVzIiwibWFwIiwiZXJyb3JBbmRUaHJvdyIsImdldFBvcnRGcm9tRW11bGF0b3JTdHJpbmciLCJwbGF0Zm9ybVZlcnNpb24iLCJ0cmltIiwidXRpbCIsImNvZXJjZVZlcnNpb24iLCJhdmFpbERldmljZXMiLCJwYXJ0aWFsTWF0Y2hDYW5kaWRhdGUiLCJleHRyYWN0VmVyc2lvbkRpZ2l0cyIsInZlcnNpb25TdHIiLCJtYXRjaCIsInNsaWNlIiwibWFqb3JQbGF0Zm9ybVZlcnNpb24iLCJtaW5vclBsYXRmb3JtVmVyc2lvbiIsImRldmljZSIsInNldERldmljZUlkIiwicmF3RGV2aWNlT1MiLCJnZXRQbGF0Zm9ybVZlcnNpb24iLCJkZXZpY2VPUyIsImNvbXBhcmVWZXJzaW9ucyIsIm1ham9yRGV2aWNlVmVyc2lvbiIsIm1pbm9yRGV2aWNlVmVyc2lvbiIsImtleXMiLCJzZXRFbXVsYXRvclBvcnQiLCJ2YWxpZGF0ZVBhY2thZ2VBY3Rpdml0eU5hbWVzIiwia2V5IiwibmFtZSIsImluZGV4Iiwic3Vic3RyaW5nIiwiZ2V0TGF1bmNoSW5mbyIsImFwcCIsImFwcFBhY2thZ2UiLCJhcHBBY3Rpdml0eSIsImFwcFdhaXRQYWNrYWdlIiwiYXBwV2FpdEFjdGl2aXR5IiwiYXBrUGFja2FnZSIsImFwa0FjdGl2aXR5IiwicGFja2FnZUFuZExhdW5jaEFjdGl2aXR5RnJvbU1hbmlmZXN0IiwicmVzZXRBcHAiLCJmYXN0UmVzZXQiLCJmdWxsUmVzZXQiLCJhbmRyb2lkSW5zdGFsbFRpbWVvdXQiLCJhdXRvR3JhbnRQZXJtaXNzaW9ucyIsImFsbG93VGVzdFBhY2thZ2VzIiwiaXNJbnN0YWxsZWQiLCJpc0FwcEluc3RhbGxlZCIsImZvcmNlU3RvcCIsImlnbiIsIm91dHB1dCIsImNsZWFyIiwiZ3JhbnRBbGxQZXJtaXNzaW9ucyIsImVycm9yIiwidW5pbnN0YWxsQXBrIiwiaW5zdGFsbCIsImdyYW50UGVybWlzc2lvbnMiLCJ0aW1lb3V0IiwiaW5zdGFsbEFwayIsImVuZm9yY2VBcHBJbnN0YWxsIiwiYXBwU3RhdGUiLCJ3YXNVbmluc3RhbGxlZCIsImluc3RhbGxPclVwZ3JhZGUiLCJlbmZvcmNlQ3VycmVudEJ1aWxkIiwiaXNJbnN0YWxsZWRPdmVyRXhpc3RpbmdBcHAiLCJBUFBfSU5TVEFMTF9TVEFURSIsIk5PVF9JTlNUQUxMRUQiLCJpbnN0YWxsT3RoZXJBcGtzIiwib3RoZXJBcHBzIiwiQiIsImFsbCIsIm90aGVyQXBwIiwidW5pbnN0YWxsT3RoZXJQYWNrYWdlcyIsImFwcFBhY2thZ2VzIiwiZmlsdGVyUGFja2FnZXMiLCJnZXRUaGlyZFBhcnR5UGFja2FnZXMiLCJwYWNrYWdlc1N0cmluZyIsInNoZWxsIiwiYXBwUGFja2FnZXNBcnJheSIsInNwbGl0IiwiRU9MIiwiZGlmZmVyZW5jZSIsImVyciIsImluaXRVbmljb2RlS2V5Ym9hcmQiLCJkZWZhdWx0SU1FIiwiYXBwaXVtSU1FIiwiZW5hYmxlSU1FIiwic2V0SU1FIiwic2V0TW9ja0xvY2F0aW9uQXBwIiwiZ2V0QXBpTGV2ZWwiLCJpbnN0YWxsSGVscGVyQXBwIiwiYXBrUGF0aCIsInBhY2thZ2VJZCIsInJldHJ5SW5zdGFsbEhlbHBlckFwcCIsInB1c2hTZXR0aW5nc0FwcCIsInRocm93RXJyb3IiLCJzZXR0aW5nc0Fwa1BhdGgiLCJwcm9jZXNzRXhpc3RzIiwic3RhcnRBcHAiLCJhY3Rpb24iLCJjYXRlZ29yeSIsInN0b3BBcHAiLCJ3YWl0Rm9yTGF1bmNoIiwid2FpdE1zIiwiaW50ZXJ2YWxNcyIsInB1c2hTdHJpbmdzIiwicmVtb3RlRGlyIiwic3RyaW5nc0pzb24iLCJyZW1vdGVGaWxlIiwicGF0aCIsInBvc2l4IiwicmVzb2x2ZSIsInJpbXJhZiIsInB1bGxBcGsiLCJ0bXBEaXIiLCJpc0VtcHR5IiwiZnMiLCJleGlzdHMiLCJzdHJpbmdzVG1wRGlyIiwiYXBrU3RyaW5ncyIsImxvY2FsUGF0aCIsImV4dHJhY3RTdHJpbmdzRnJvbUFwayIsInVubG9ja1dpdGhVSUF1dG9tYXRpb24iLCJkcml2ZXIiLCJ1bmxvY2tDYXBhYmlsaXRpZXMiLCJ1bmxvY2tUeXBlIiwidW5sb2NrZXIiLCJpc1ZhbGlkVW5sb2NrVHlwZSIsInVubG9ja0tleSIsImlzVmFsaWRLZXkiLCJ1bmxvY2tNZXRob2QiLCJQSU5fVU5MT0NLIiwicGluVW5sb2NrIiwiUEFTU1dPUkRfVU5MT0NLIiwicGFzc3dvcmRVbmxvY2siLCJQQVRURVJOX1VOTE9DSyIsInBhdHRlcm5VbmxvY2siLCJGSU5HRVJQUklOVF9VTkxPQ0siLCJmaW5nZXJwcmludFVubG9jayIsInVubG9ja1dpdGhIZWxwZXJBcHAiLCJmaXJzdFJ1biIsImxhdW5jaEhlbHBlciIsImlzU2NyZWVuTG9ja2VkIiwiZGVsYXkiLCJ1bmxvY2siLCJjYXBhYmlsaXRpZXMiLCJ2ZXJpZnlVbmxvY2siLCJpbml0RGV2aWNlIiwic2tpcERldmljZUluaXRpYWxpemF0aW9uIiwid2FpdEZvckRldmljZSIsInNob3VsZFRocm93RXJyb3IiLCJsb2NhbGVTY3JpcHQiLCJ1bmljb2RlS2V5Ym9hcmQiLCJkaXNhYmxlV2luZG93QW5pbWF0aW9uIiwic2tpcFVubG9jayIsInNraXBMb2djYXRDYXB0dXJlIiwic3RhcnRMb2djYXQiLCJyZW1vdmVOdWxsUHJvcGVydGllcyIsIm9iaiIsImlzTnVsbCIsInRydW5jYXRlRGVjaW1hbHMiLCJudW1iZXIiLCJkaWdpdHMiLCJtdWx0aXBsaWVyIiwiTWF0aCIsInBvdyIsImFkanVzdGVkTnVtIiwidHJ1bmNhdGVkTnVtIiwiaXNDaHJvbWVCcm93c2VyIiwiT2JqZWN0IiwiZ2V0Q2hyb21lUGtnIiwicmVtb3ZlQWxsU2Vzc2lvbldlYlNvY2tldEhhbmRsZXJzIiwic2VydmVyIiwic2Vzc2lvbklkIiwiaXNGdW5jdGlvbiIsImdldFdlYlNvY2tldEhhbmRsZXJzIiwiYWN0aXZlSGFuZGxlcnMiLCJwYXRobmFtZSIsInJlbW92ZVdlYlNvY2tldEhhbmRsZXIiLCJwYXJzZUFycmF5IiwiY2FwIiwicGFyc2VkQ2FwcyIsIkpTT04iLCJwYXJzZSIsImlzQXJyYXkiLCJ2YWxpZGF0ZURlc2lyZWRDYXBzIiwiY2FwcyIsImJyb3dzZXJOYW1lIiwiYm9vdHN0cmFwIiwiQm9vdHN0cmFwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBRUEsTUFBTUEsdUJBQXVCLEdBQUcsS0FBaEM7QUFDQSxNQUFNQywrQkFBK0IsR0FBRztBQUN0Q0MsRUFBQUEsTUFBTSxFQUFFO0FBQ05DLElBQUFBLEdBQUcsRUFBRSxvQkFEQztBQUVOQyxJQUFBQSxRQUFRLEVBQUU7QUFGSixHQUQ4QjtBQUt0Q0MsRUFBQUEsUUFBUSxFQUFFO0FBQ1JGLElBQUFBLEdBQUcsRUFBRSwyQkFERztBQUVSQyxJQUFBQSxRQUFRLEVBQUU7QUFGRixHQUw0QjtBQVN0Q0UsRUFBQUEsVUFBVSxFQUFFO0FBQ1ZILElBQUFBLEdBQUcsRUFBRSxpQkFESztBQUVWQyxJQUFBQSxRQUFRLEVBQUU7QUFGQSxHQVQwQjtBQWF0Q0csRUFBQUEsT0FBTyxFQUFFO0FBQ1BKLElBQUFBLEdBQUcsRUFBRSxxQkFERTtBQUVQQyxJQUFBQSxRQUFRLEVBQUU7QUFGSCxHQWI2QjtBQWlCdEMsc0JBQW9CO0FBQ2xCRCxJQUFBQSxHQUFHLEVBQUUscUJBRGE7QUFFbEJDLElBQUFBLFFBQVEsRUFBRTtBQUZRLEdB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c2gnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBleGVjIH0gZnJvbSAndGVlbl9wcm9jZXNzJztcbmltcG9ydCB7IHJldHJ5LCByZXRyeUludGVydmFsLCB3YWl0Rm9yQ29uZGl0aW9uIH0gZnJvbSAnYXN5bmNib3gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBmcywgdXRpbCB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCB7IHBhdGggYXMgc2V0dGluZ3NBcGtQYXRoIH0gZnJvbSAnaW8uYXBwaXVtLnNldHRpbmdzJztcbmltcG9ydCBCb290c3RyYXAgZnJvbSAnLi9ib290c3RyYXAnO1xuaW1wb3J0IEIgZnJvbSAnYmx1ZWJpcmQnO1xuaW1wb3J0IEFEQiBmcm9tICdhcHBpdW0tYWRiJztcbmltcG9ydCB7XG4gIGRlZmF1bHQgYXMgdW5sb2NrZXIsIFBJTl9VTkxPQ0ssIFBBU1NXT1JEX1VOTE9DSyxcbiAgUEFUVEVSTl9VTkxPQ0ssIEZJTkdFUlBSSU5UX1VOTE9DSyB9IGZyb20gJy4vdW5sb2NrLWhlbHBlcnMnO1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnO1xuXG5jb25zdCBQQUNLQUdFX0lOU1RBTExfVElNRU9VVCA9IDkwMDAwOyAvLyBtaWxsaXNlY29uZHNcbmNvbnN0IENIUk9NRV9CUk9XU0VSX1BBQ0tBR0VfQUNUSVZJVFkgPSB7XG4gIGNocm9tZToge1xuICAgIHBrZzogJ2NvbS5hbmRyb2lkLmNocm9tZScsXG4gICAgYWN0aXZpdHk6ICdjb20uZ29vZ2xlLmFuZHJvaWQuYXBwcy5jaHJvbWUuTWFpbicsXG4gIH0sXG4gIGNocm9taXVtOiB7XG4gICAgcGtnOiAnb3JnLmNocm9taXVtLmNocm9tZS5zaGVsbCcsXG4gICAgYWN0aXZpdHk6ICcuQ2hyb21lU2hlbGxBY3Rpdml0eScsXG4gIH0sXG4gIGNocm9tZWJldGE6IHtcbiAgICBwa2c6ICdjb20uY2hyb21lLmJldGEnLFxuICAgIGFjdGl2aXR5OiAnY29tLmdvb2dsZS5hbmRyb2lkLmFwcHMuY2hyb21lLk1haW4nLFxuICB9LFxuICBicm93c2VyOiB7XG4gICAgcGtnOiAnY29tLmFuZHJvaWQuYnJvd3NlcicsXG4gICAgYWN0aXZpdHk6ICdjb20uYW5kcm9pZC5icm93c2VyLkJyb3dzZXJBY3Rpdml0eScsXG4gIH0sXG4gICdjaHJvbWl1bS1icm93c2VyJzoge1xuICAgIHBrZzogJ29yZy5jaHJvbWl1bS5jaHJvbWUnLFxuICAgIGFjdGl2aXR5OiAnY29tLmdvb2dsZS5hbmRyb2lkLmFwcHMuY2hyb21lLk1haW4nLFxuICB9LFxuICAnY2hyb21pdW0td2Vidmlldyc6IHtcbiAgICBwa2c6ICdvcmcuY2hyb21pdW0ud2Vidmlld19zaGVsbCcsXG4gICAgYWN0aXZpdHk6ICdvcmcuY2hyb21pdW0ud2Vidmlld19zaGVsbC5XZWJWaWV3QnJvd3NlckFjdGl2aXR5JyxcbiAgfSxcbiAgZGVmYXVsdDoge1xuICAgIHBrZzogJ2NvbS5hbmRyb2lkLmNocm9tZScsXG4gICAgYWN0aXZpdHk6ICdjb20uZ29vZ2xlLmFuZHJvaWQuYXBwcy5jaHJvbWUuTWFpbicsXG4gIH0sXG59O1xuY29uc3QgU0VUVElOR1NfSEVMUEVSX1BLR19JRCA9ICdpby5hcHBpdW0uc2V0dGluZ3MnO1xuY29uc3QgU0VUVElOR1NfSEVMUEVSX01BSU5fQUNUSVZJVFkgPSAnLlNldHRpbmdzJztcbmNvbnN0IFNFVFRJTkdTX0hFTFBFUl9VTkxPQ0tfQUNUSVZJVFkgPSAnLlVubG9jayc7XG5cbmxldCBoZWxwZXJzID0ge307XG5cbmhlbHBlcnMuY3JlYXRlQmFzZUFEQiA9IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUJhc2VBREIgKG9wdHMgPSB7fSkge1xuICAvLyBmaWx0ZXIgb3V0IGFueSB1bndhbnRlZCBvcHRpb25zIHNlbnQgaW5cbiAgLy8gdGhpcyBsaXN0IHNob3VsZCBiZSB1cGRhdGVkIGFzIEFEQiB0YWtlcyBtb3JlIGFyZ3VtZW50c1xuICBjb25zdCB7XG4gICAgYWRiUG9ydCxcbiAgICBzdXBwcmVzc0tpbGxTZXJ2ZXIsXG4gICAgcmVtb3RlQWRiSG9zdCxcbiAgICBjbGVhckRldmljZUxvZ3NPblN0YXJ0LFxuICAgIGFkYkV4ZWNUaW1lb3V0LFxuICAgIHVzZUtleXN0b3JlLFxuICAgIGtleXN0b3JlUGF0aCxcbiAgICBrZXlzdG9yZVBhc3N3b3JkLFxuICAgIGtleUFsaWFzLFxuICAgIGtleVBhc3N3b3JkLFxuICAgIHJlbW90ZUFwcHNDYWNoZUxpbWl0LFxuICAgIGJ1aWxkVG9vbHNWZXJzaW9uLFxuICB9ID0gb3B0cztcbiAgcmV0dXJuIGF3YWl0IEFEQi5jcmVhdGVBREIoe1xuICAgIGFkYlBvcnQsXG4gICAgc3VwcHJlc3NLaWxsU2VydmVyLFxuICAgIHJlbW90ZUFkYkhvc3QsXG4gICAgY2xlYXJEZXZpY2VMb2dzT25TdGFydCxcbiAgICBhZGJFeGVjVGltZW91dCxcbiAgICB1c2VLZXlzdG9yZSxcbiAgICBrZXlzdG9yZVBhdGgsXG4gICAga2V5c3RvcmVQYXNzd29yZCxcbiAgICBrZXlBbGlhcyxcbiAgICBrZXlQYXNzd29yZCxcbiAgICByZW1vdGVBcHBzQ2FjaGVMaW1pdCxcbiAgICBidWlsZFRvb2xzVmVyc2lvbixcbiAgfSk7XG59O1xuXG5oZWxwZXJzLmdldEphdmFWZXJzaW9uID0gYXN5bmMgZnVuY3Rpb24gZ2V0SmF2YVZlcnNpb24gKGxvZ1ZlcnNpb24gPSB0cnVlKSB7XG4gIGxldCBzdGRlcnI7XG4gIHRyeSB7XG4gICAgKHtzdGRlcnJ9ID0gYXdhaXQgZXhlYygnamF2YScsIFsnLXZlcnNpb24nXSkpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZ2V0IHRoZSBKYXZhIHZlcnNpb24uIElzIEphdmEgaW5zdGFsbGVkPyBPcmlnaW5hbCBlcnJvcjogJHtlLnN0ZGVycn1gKTtcbiAgfVxuICBjb25zdCB2ZXJzaW9uTWF0Y2ggPSAvKGphdmF8b3BlbmpkaylcXHMrdmVyc2lvbi4rPyhbMC05Ll9dKykvaS5leGVjKHN0ZGVycik7XG4gIGlmICghdmVyc2lvbk1hdGNoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcGFyc2UgSmF2YSB2ZXJzaW9uLiBJcyBKYXZhIGluc3RhbGxlZD8gT3JpZ2luYWwgb3V0cHV0OiAke3N0ZGVycn1gKTtcbiAgfVxuICBpZiAobG9nVmVyc2lvbikge1xuICAgIGxvZ2dlci5pbmZvKGBKYXZhIHZlcnNpb24gaXM6ICR7dmVyc2lvbk1hdGNoWzJdfWApO1xuICB9XG4gIHJldHVybiB2ZXJzaW9uTWF0Y2hbMl07XG59O1xuXG5oZWxwZXJzLnByZXBhcmVFbXVsYXRvciA9IGFzeW5jIGZ1bmN0aW9uIHByZXBhcmVFbXVsYXRvciAoYWRiLCBvcHRzKSB7XG4gIGxldCB7XG4gICAgYXZkLFxuICAgIGF2ZEFyZ3MsXG4gICAgbGFuZ3VhZ2UsXG4gICAgbG9jYWxlLFxuICAgIGF2ZExhdW5jaFRpbWVvdXQsXG4gICAgYXZkUmVhZHlUaW1lb3V0LFxuICB9ID0gb3B0cztcbiAgaWYgKCFhdmQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBsYXVuY2ggQVZEIHdpdGhvdXQgQVZEIG5hbWUnKTtcbiAgfVxuICBsZXQgYXZkTmFtZSA9IGF2ZC5yZXBsYWNlKCdAJywgJycpO1xuICBsZXQgcnVubmluZ0FWRCA9IGF3YWl0IGFkYi5nZXRSdW5uaW5nQVZEKGF2ZE5hbWUpO1xuICBpZiAocnVubmluZ0FWRCAhPT0gbnVsbCkge1xuICAgIGlmIChhdmRBcmdzICYmIGF2ZEFyZ3MudG9Mb3dlckNhc2UoKS5pbmRleE9mKCctd2lwZS1kYXRhJykgPiAtMSkge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBLaWxsaW5nICcke2F2ZE5hbWV9JyBiZWNhdXNlIGl0IG5lZWRzIHRvIGJlIHdpcGVkIGF0IHN0YXJ0LmApO1xuICAgICAgYXdhaXQgYWRiLmtpbGxFbXVsYXRvcihhdmROYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdOb3QgbGF1bmNoaW5nIEFWRCBiZWNhdXNlIGl0IGlzIGFscmVhZHkgcnVubmluZy4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbiAgYXZkQXJncyA9IHRoaXMucHJlcGFyZUFWREFyZ3Mob3B0cywgYWRiLCBhdmRBcmdzKTtcbiAgYXdhaXQgYWRiLmxhdW5jaEFWRChhdmQsIGF2ZEFyZ3MsIGxhbmd1YWdlLCBsb2NhbGUsIGF2ZExhdW5jaFRpbWVvdXQsXG4gICAgICAgICAgICAgICAgICAgICAgYXZkUmVhZHlUaW1lb3V0KTtcbn07XG5cbmhlbHBlcnMucHJlcGFyZUFWREFyZ3MgPSBmdW5jdGlvbiBwcmVwYXJlQVZEQXJncyAob3B0cywgYWRiLCBhdmRBcmdzKSB7XG4gIGxldCBhcmdzID0gYXZkQXJncyA/IFthdmRBcmdzXSA6IFtdO1xuICBpZiAoIV8uaXNVbmRlZmluZWQob3B0cy5uZXR3b3JrU3BlZWQpKSB7XG4gICAgbGV0IG5ldHdvcmtTcGVlZCA9IHRoaXMuZW5zdXJlTmV0d29ya1NwZWVkKGFkYiwgb3B0cy5uZXR3b3JrU3BlZWQpO1xuICAgIGFyZ3MucHVzaCgnLW5ldHNwZWVkJywgbmV0d29ya1NwZWVkKTtcbiAgfVxuICBpZiAob3B0cy5pc0hlYWRsZXNzKSB7XG4gICAgYXJncy5wdXNoKCctbm8td2luZG93Jyk7XG4gIH1cbiAgcmV0dXJuIGFyZ3Muam9pbignICcpO1xufTtcblxuaGVscGVycy5lbnN1cmVOZXR3b3JrU3BlZWQgPSBmdW5jdGlvbiBlbnN1cmVOZXR3b3JrU3BlZWQgKGFkYiwgbmV0d29ya1NwZWVkKSB7XG4gIGlmIChfLnZhbHVlcyhhZGIuTkVUV09SS19TUEVFRCkuaW5kZXhPZihuZXR3b3JrU3BlZWQpICE9PSAtMSkge1xuICAgIHJldHVybiBuZXR3b3JrU3BlZWQ7XG4gIH1cbiAgbG9nZ2VyLndhcm4oYFdyb25nIG5ldHdvcmsgc3BlZWQgcGFyYW0gJHtuZXR3b3JrU3BlZWR9LCB1c2luZyBkZWZhdWx0OiBmdWxsLiBTdXBwb3J0ZWQgdmFsdWVzOiAke18udmFsdWVzKGFkYi5ORVRXT1JLX1NQRUVEKX1gKTtcbiAgcmV0dXJuIGFkYi5ORVRXT1JLX1NQRUVELkZVTEw7XG59O1xuXG4vKipcbiAqIFNldCBhbmQgZW5zdXJlIHRoZSBsb2NhbGUgbmFtZSBvZiB0aGUgZGV2aWNlIHVuZGVyIHRlc3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGFkYiAtIFRoZSBhZGIgbW9kdWxlIGluc3RhbmNlLlxuICogQHBhcmFtIHtzdHJpbmd9IGxhbmd1YWdlIC0gTGFuZ3VhZ2UuIFRoZSBsYW5ndWFnZSBmaWVsZCBpcyBjYXNlIGluc2Vuc2l0aXZlLCBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIGxvd2VyIGNhc2UuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQ6IFthLXpBLVpdezIsOH0uIGUuZy4gZW4sIGphIDogaHR0cHM6Ly9kZXZlbG9wZXIuYW5kcm9pZC5jb20vcmVmZXJlbmNlL2phdmEvdXRpbC9Mb2NhbGUuaHRtbFxuICogQHBhcmFtIHtzdHJpbmd9IGNvdW50cnkgLSBDb3VudHJ5LiBUaGUgY291bnRyeSAocmVnaW9uKSBmaWVsZCBpcyBjYXNlIGluc2Vuc2l0aXZlLCBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIHVwcGVyIGNhc2UuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQ6IFthLXpBLVpdezJ9IHwgWzAtOV17M30uIGUuZy4gVVMsIEpQIDogaHR0cHM6Ly9kZXZlbG9wZXIuYW5kcm9pZC5jb20vcmVmZXJlbmNlL2phdmEvdXRpbC9Mb2NhbGUuaHRtbFxuICogQHBhcmFtIHs/c3RyaW5nfSBzY3JpcHQgLSBTY3JpcHQuIFRoZSBzY3JpcHQgZmllbGQgaXMgY2FzZSBpbnNlbnNpdGl2ZSBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIHRpdGxlIGNhc2UuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQ6IFthLXpBLVpdezR9LiBlLmcuIEhhbnMgaW4gemgtSGFucy1DTiA6IGh0dHBzOi8vZGV2ZWxvcGVyLmFuZHJvaWQuY29tL3JlZmVyZW5jZS9qYXZhL3V0aWwvTG9jYWxlLmh0bWxcbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiBpdCBmYWlsZWQgdG8gc2V0IGxvY2FsZSBwcm9wZXJseVxuICovXG5oZWxwZXJzLmVuc3VyZURldmljZUxvY2FsZSA9IGFzeW5jIGZ1bmN0aW9uIGVuc3VyZURldmljZUxvY2FsZSAoYWRiLCBsYW5ndWFnZSwgY291bnRyeSwgc2NyaXB0ID0gbnVsbCkge1xuICBpZiAoIV8uaXNTdHJpbmcobGFuZ3VhZ2UpICYmICFfLmlzU3RyaW5nKGNvdW50cnkpKSB7XG4gICAgbG9nZ2VyLndhcm4oYHNldERldmljZUxhbmd1YWdlQ291bnRyeSByZXF1aXJlcyBsYW5ndWFnZSBvciBjb3VudHJ5LmApO1xuICAgIGxvZ2dlci53YXJuKGBHb3QgbGFuZ3VhZ2U6ICcke2xhbmd1YWdlfScgYW5kIGNvdW50cnk6ICcke2NvdW50cnl9J2ApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGF3YWl0IGFkYi5zZXREZXZpY2VMYW5ndWFnZUNvdW50cnkobGFuZ3VhZ2UsIGNvdW50cnksIHNjcmlwdCk7XG5cbiAgaWYgKCFhd2FpdCBhZGIuZW5zdXJlQ3VycmVudExvY2FsZShsYW5ndWFnZSwgY291bnRyeSwgc2NyaXB0KSkge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBzY3JpcHQgPyBgbGFuZ3VhZ2U6ICR7bGFuZ3VhZ2V9LCBjb3VudHJ5OiAke2NvdW50cnl9IGFuZCBzY3JpcHQ6ICR7c2NyaXB0fWAgOiBgbGFuZ3VhZ2U6ICR7bGFuZ3VhZ2V9IGFuZCBjb3VudHJ5OiAke2NvdW50cnl9YDtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBzZXQgJHttZXNzYWdlfWApO1xuICB9XG59O1xuXG5oZWxwZXJzLmdldERldmljZUluZm9Gcm9tQ2FwcyA9IGFzeW5jIGZ1bmN0aW9uIGdldERldmljZUluZm9Gcm9tQ2FwcyAob3B0cyA9IHt9KSB7XG4gIC8vIHdlIGNhbiBjcmVhdGUgYSB0aHJvd2F3YXkgQURCIGluc3RhbmNlIGhlcmUsIHNvIHRoZXJlIGlzIG5vIGRlcGVuZGVuY3lcbiAgLy8gb24gaW5zdGFudGlhdGluZyBvbiBlYXJsaWVyIChhdCB0aGlzIHBvaW50LCB3ZSBoYXZlIG5vIHVkaWQpXG4gIC8vIHdlIGNhbiBvbmx5IHVzZSB0aGlzIEFEQiBvYmplY3QgZm9yIGNvbW1hbmRzIHRoYXQgd291bGQgbm90IGJlIGNvbmZ1c2VkXG4gIC8vIGlmIG11bHRpcGxlIGRldmljZXMgYXJlIGNvbm5lY3RlZFxuICBjb25zdCBhZGIgPSBhd2FpdCBoZWxwZXJzLmNyZWF0ZUJhc2VBREIob3B0cyk7XG4gIGxldCB1ZGlkID0gb3B0cy51ZGlkO1xuICBsZXQgZW1Qb3J0ID0gbnVsbDtcblxuICAvLyBhIHNwZWNpZmljIGF2ZCBuYW1lIHdhcyBnaXZlbi4gdHJ5IHRvIGluaXRpYWxpemUgd2l0aCB0aGF0XG4gIGlmIChvcHRzLmF2ZCkge1xuICAgIGF3YWl0IGhlbHBlcnMucHJlcGFyZUVtdWxhdG9yKGFkYiwgb3B0cyk7XG4gICAgdWRpZCA9IGFkYi5jdXJEZXZpY2VJZDtcbiAgICBlbVBvcnQgPSBhZGIuZW11bGF0b3JQb3J0O1xuICB9IGVsc2Uge1xuICAgIC8vIG5vIGF2ZCBnaXZlbi4gbGV0cyB0cnkgd2hhdGV2ZXIncyBwbHVnZ2VkIGluIGRldmljZXMvZW11bGF0b3JzXG4gICAgbG9nZ2VyLmluZm8oJ1JldHJpZXZpbmcgZGV2aWNlIGxpc3QnKTtcbiAgICBsZXQgZGV2aWNlcyA9IGF3YWl0IGFkYi5nZXREZXZpY2VzV2l0aFJldHJ5KCk7XG5cbiAgICAvLyB1ZGlkIHdhcyBnaXZlbiwgbGV0cyB0cnkgdG8gaW5pdCB3aXRoIHRoYXQgZGV2aWNlXG4gICAgaWYgKHVkaWQpIHtcbiAgICAgIGlmICghXy5pbmNsdWRlcyhfLm1hcChkZXZpY2VzLCAndWRpZCcpLCB1ZGlkKSkge1xuICAgICAgICBsb2dnZXIuZXJyb3JBbmRUaHJvdyhgRGV2aWNlICR7dWRpZH0gd2FzIG5vdCBpbiB0aGUgbGlzdCBvZiBjb25uZWN0ZWQgZGV2aWNlc2ApO1xuICAgICAgfVxuICAgICAgZW1Qb3J0ID0gYWRiLmdldFBvcnRGcm9tRW11bGF0b3JTdHJpbmcodWRpZCk7XG4gICAgfSBlbHNlIGlmIChvcHRzLnBsYXRmb3JtVmVyc2lvbikge1xuICAgICAgb3B0cy5wbGF0Zm9ybVZlcnNpb24gPSBgJHtvcHRzLnBsYXRmb3JtVmVyc2lvbn1gLnRyaW0oKTtcblxuICAgICAgLy8gYSBwbGF0Zm9ybSB2ZXJzaW9uIHdhcyBnaXZlbi4gbGV0cyB0cnkgdG8gZmluZCBhIGRldmljZSB3aXRoIHRoZSBzYW1lIG9zXG4gICAgICBjb25zdCBwbGF0Zm9ybVZlcnNpb24gPSB1dGlsLmNvZXJjZVZlcnNpb24ob3B0cy5wbGF0Zm9ybVZlcnNpb24sIGZhbHNlKTtcbiAgICAgIGlmICghcGxhdGZvcm1WZXJzaW9uKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvckFuZFRocm93KGBUaGUgcHJvdmlkZWQgcGxhdGZvcm0gdmVyc2lvbiB2YWx1ZSAnJHtwbGF0Zm9ybVZlcnNpb259JyBgICtcbiAgICAgICAgICBgY2Fubm90IGJlIGNvZXJjZWQgdG8gYSB2YWxpZCB2ZXJzaW9uIG51bWJlcmApO1xuICAgICAgfVxuICAgICAgbG9nZ2VyLmluZm8oYExvb2tpbmcgZm9yIGEgZGV2aWNlIHdpdGggQW5kcm9pZCAnJHtvcHRzLnBsYXRmb3JtVmVyc2lvbn0nYCk7XG5cbiAgICAgIC8vIGluIGNhc2Ugd2UgZmFpbCB0byBmaW5kIHNvbWV0aGluZywgZ2l2ZSB0aGUgdXNlciBhIHVzZWZ1bCBsb2cgdGhhdCBoYXNcbiAgICAgIC8vIHRoZSBkZXZpY2UgdWRpZHMgYW5kIG9zIHZlcnNpb25zIHNvIHRoZXkga25vdyB3aGF0J3MgYXZhaWxhYmxlXG4gICAgICBjb25zdCBhdmFpbERldmljZXMgPSBbXTtcbiAgICAgIGxldCBwYXJ0aWFsTWF0Y2hDYW5kaWRhdGUgPSBudWxsO1xuICAgICAgY29uc3QgZXh0cmFjdFZlcnNpb25EaWdpdHMgPSAodmVyc2lvblN0cikgPT4ge1xuICAgICAgICBjb25zdCBtYXRjaCA9IC8oXFxkKylcXC4/KFxcZCspPy8uZXhlYyh2ZXJzaW9uU3RyKTtcbiAgICAgICAgcmV0dXJuIG1hdGNoID8gbWF0Y2guc2xpY2UoMSkgOiBbXTtcbiAgICAgIH07XG4gICAgICBjb25zdCBbbWFqb3JQbGF0Zm9ybVZlcnNpb24sIG1pbm9yUGxhdGZvcm1WZXJzaW9uXSA9IGV4dHJhY3RWZXJzaW9uRGlnaXRzKHBsYXRmb3JtVmVyc2lvbik7XG4gICAgICAvLyBmaXJzdCB0cnkgc3RhcnRlZCBkZXZpY2VzL2VtdWxhdG9yc1xuICAgICAgZm9yIChjb25zdCBkZXZpY2Ugb2YgZGV2aWNlcykge1xuICAgICAgICAvLyBkaXJlY3QgYWRiIGNhbGxzIHRvIHRoZSBzcGVjaWZpYyBkZXZpY2VcbiAgICAgICAgYXdhaXQgYWRiLnNldERldmljZUlkKGRldmljZS51ZGlkKTtcbiAgICAgICAgY29uc3QgcmF3RGV2aWNlT1MgPSBhd2FpdCBhZGIuZ2V0UGxhdGZvcm1WZXJzaW9uKCk7XG4gICAgICAgIGF2YWlsRGV2aWNlcy5wdXNoKGAke2RldmljZS51ZGlkfSAoJHtyYXdEZXZpY2VPU30pYCk7XG4gICAgICAgIGNvbnN0IGRldmljZU9TID0gdXRpbC5jb2VyY2VWZXJzaW9uKHJhd0RldmljZU9TLCBmYWxzZSk7XG4gICAgICAgIGlmICghZGV2aWNlT1MpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh1dGlsLmNvbXBhcmVWZXJzaW9ucyhkZXZpY2VPUywgJz09JywgcGxhdGZvcm1WZXJzaW9uKSkge1xuICAgICAgICAgIC8vIEdvdCBhbiBleGFjdCBtYXRjaCAtIHByb2NlZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgICB1ZGlkID0gZGV2aWNlLnVkaWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBbbWFqb3JEZXZpY2VWZXJzaW9uLCBtaW5vckRldmljZVZlcnNpb25dID0gZXh0cmFjdFZlcnNpb25EaWdpdHMoZGV2aWNlT1MpO1xuICAgICAgICBpZiAoKCFvcHRzLnBsYXRmb3JtVmVyc2lvbi5pbmNsdWRlcygnLicpICYmIG1ham9yUGxhdGZvcm1WZXJzaW9uID09PSBtYWpvckRldmljZVZlcnNpb24pXG4gICAgICAgICAgfHwgKG1ham9yUGxhdGZvcm1WZXJzaW9uID09PSBtYWpvckRldmljZVZlcnNpb24gJiYgbWlub3JQbGF0Zm9ybVZlcnNpb24gPT09IG1pbm9yRGV2aWNlVmVyc2lvbikpIHtcbiAgICAgICAgICAvLyBHb3QgYSBwYXJ0aWFsIG1hdGNoIC0gbWFrZSBzdXJlIHdlIGNvbnNpZGVyIHRoZSBtb3N0IHJlY2VudFxuICAgICAgICAgIC8vIGRldmljZSB2ZXJzaW9uIGF2YWlsYWJsZSBvbiB0aGUgaG9zdCBzeXN0ZW1cbiAgICAgICAgICBpZiAocGFydGlhbE1hdGNoQ2FuZGlkYXRlXG4gICAgICAgICAgICAgICYmIHV0aWwuY29tcGFyZVZlcnNpb25zKGRldmljZU9TLCAnPicsIF8udmFsdWVzKHBhcnRpYWxNYXRjaENhbmRpZGF0ZSlbMF0pXG4gICAgICAgICAgICAgIHx8ICFwYXJ0aWFsTWF0Y2hDYW5kaWRhdGUpIHtcbiAgICAgICAgICAgIHBhcnRpYWxNYXRjaENhbmRpZGF0ZSA9IHtbZGV2aWNlLnVkaWRdOiBkZXZpY2VPU307XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIXVkaWQgJiYgcGFydGlhbE1hdGNoQ2FuZGlkYXRlKSB7XG4gICAgICAgIHVkaWQgPSBfLmtleXMocGFydGlhbE1hdGNoQ2FuZGlkYXRlKVswXTtcbiAgICAgICAgYXdhaXQgYWRiLnNldERldmljZUlkKHVkaWQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXVkaWQpIHtcbiAgICAgICAgLy8gd2UgY291bGRuJ3QgZmluZCBhbnl0aGluZyEgcXVpdFxuICAgICAgICBsb2dnZXIuZXJyb3JBbmRUaHJvdyhgVW5hYmxlIHRvIGZpbmQgYW4gYWN0aXZlIGRldmljZSBvciBlbXVsYXRvciBgICtcbiAgICAgICAgICBgd2l0aCBPUyAke29wdHMucGxhdGZvcm1WZXJzaW9ufS4gVGhlIGZvbGxvd2luZyBhcmUgYXZhaWxhYmxlOiBgICtcbiAgICAgICAgICBhdmFpbERldmljZXMuam9pbignLCAnKSk7XG4gICAgICB9XG5cbiAgICAgIGVtUG9ydCA9IGFkYi5nZXRQb3J0RnJvbUVtdWxhdG9yU3RyaW5nKHVkaWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBhIHVkaWQgd2FzIG5vdCBnaXZlbiwgZ3JhYiB0aGUgZmlyc3QgZGV2aWNlIHdlIHNlZVxuICAgICAgdWRpZCA9IGRldmljZXNbMF0udWRpZDtcbiAgICAgIGVtUG9ydCA9IGFkYi5nZXRQb3J0RnJvbUVtdWxhdG9yU3RyaW5nKHVkaWQpO1xuICAgIH1cbiAgfVxuXG4gIGxvZ2dlci5pbmZvKGBVc2luZyBkZXZpY2U6ICR7dWRpZH1gKTtcbiAgcmV0dXJuIHt1ZGlkLCBlbVBvcnR9O1xufTtcblxuLy8gcmV0dXJucyBhIG5ldyBhZGIgaW5zdGFuY2Ugd2l0aCBkZXZpY2VJZCBzZXRcbmhlbHBlcnMuY3JlYXRlQURCID0gYXN5bmMgZnVuY3Rpb24gY3JlYXRlQURCIChvcHRzID0ge30pIHtcbiAgY29uc3Qge3VkaWQsIGVtUG9ydH0gPSBvcHRzO1xuICBjb25zdCBhZGIgPSBhd2FpdCBoZWxwZXJzLmNyZWF0ZUJhc2VBREIob3B0cyk7XG4gIGFkYi5zZXREZXZpY2VJZCh1ZGlkKTtcbiAgaWYgKGVtUG9ydCkge1xuICAgIGFkYi5zZXRFbXVsYXRvclBvcnQoZW1Qb3J0KTtcbiAgfVxuXG4gIHJldHVybiBhZGI7XG59O1xuXG5oZWxwZXJzLnZhbGlkYXRlUGFja2FnZUFjdGl2aXR5TmFtZXMgPSBmdW5jdGlvbiB2YWxpZGF0ZVBhY2thZ2VBY3Rpdml0eU5hbWVzIChvcHRzKSB7XG4gIGZvciAoY29uc3Qga2V5IG9mIFsnYXBwUGFja2FnZScsICdhcHBBY3Rpdml0eScsICdhcHBXYWl0UGFja2FnZScsICdhcHBXYWl0QWN0aXZpdHknXSkge1xuICAgIGNvbnN0IG5hbWUgPSBvcHRzW2tleV07XG4gICAgaWYgKCFuYW1lKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBtYXRjaCA9IC8oW15cXHcuKixdKSsvLmV4ZWMobmFtZSk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgbG9nZ2VyLndhcm4oYENhcGFiaWxpdHkgJyR7a2V5fScgaXMgZXhwZWN0ZWQgdG8gb25seSBpbmNsdWRlIGxhdGluIGxldHRlcnMsIGRpZ2l0cywgdW5kZXJzY29yZSwgZG90LCBjb21tYSBhbmQgYXN0ZXJpc2sgY2hhcmFjdGVycy5gKTtcbiAgICBsb2dnZXIud2FybihgQ3VycmVudCB2YWx1ZSAnJHtuYW1lfScgaGFzIG5vbi1tYXRjaGluZyBjaGFyYWN0ZXIgYXQgaW5kZXggJHttYXRjaC5pbmRleH06ICcke25hbWUuc3Vic3RyaW5nKDAsIG1hdGNoLmluZGV4ICsgMSl9J2ApO1xuICB9XG59O1xuXG5oZWxwZXJzLmdldExhdW5jaEluZm8gPSBhc3luYyBmdW5jdGlvbiBnZXRMYXVuY2hJbmZvIChhZGIsIG9wdHMpIHtcbiAgbGV0IHthcHAsIGFwcFBhY2thZ2UsIGFwcEFjdGl2aXR5LCBhcHBXYWl0UGFja2FnZSwgYXBwV2FpdEFjdGl2aXR5fSA9IG9wdHM7XG4gIGlmICghYXBwKSB7XG4gICAgbG9nZ2VyLndhcm4oJ05vIGFwcCBzZW50IGluLCBub3QgcGFyc2luZyBwYWNrYWdlL2FjdGl2aXR5Jyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy52YWxpZGF0ZVBhY2thZ2VBY3Rpdml0eU5hbWVzKG9wdHMpO1xuXG4gIGlmIChhcHBQYWNrYWdlICYmIGFwcEFjdGl2aXR5KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbG9nZ2VyLmRlYnVnKCdQYXJzaW5nIHBhY2thZ2UgYW5kIGFjdGl2aXR5IGZyb20gYXBwIG1hbmlmZXN0Jyk7XG4gIGxldCB7YXBrUGFja2FnZSwgYXBrQWN0aXZpdHl9ID1cbiAgICBhd2FpdCBhZGIucGFja2FnZUFuZExhdW5jaEFjdGl2aXR5RnJvbU1hbmlmZXN0KGFwcCk7XG4gIGlmIChhcGtQYWNrYWdlICYmICFhcHBQYWNrYWdlKSB7XG4gICAgYXBwUGFja2FnZSA9IGFwa1BhY2thZ2U7XG4gIH1cbiAgaWYgKCFhcHBXYWl0UGFja2FnZSkge1xuICAgIGFwcFdhaXRQYWNrYWdlID0gYXBwUGFja2FnZTtcbiAgfVxuICBpZiAoYXBrQWN0aXZpdHkgJiYgIWFwcEFjdGl2aXR5KSB7XG4gICAgYXBwQWN0aXZpdHkgPSBhcGtBY3Rpdml0eTtcbiAgfVxuICBpZiAoIWFwcFdhaXRBY3Rpdml0eSkge1xuICAgIGFwcFdhaXRBY3Rpdml0eSA9IGFwcEFjdGl2aXR5O1xuICB9XG4gIGxvZ2dlci5kZWJ1ZyhgUGFyc2VkIHBhY2thZ2UgYW5kIGFjdGl2aXR5IGFyZTogJHthcGtQYWNrYWdlfS8ke2Fwa0FjdGl2aXR5fWApO1xuICByZXR1cm4ge2FwcFBhY2thZ2UsIGFwcFdhaXRQYWNrYWdlLCBhcHBBY3Rpdml0eSwgYXBwV2FpdEFjdGl2aXR5fTtcbn07XG5cbmhlbHBlcnMucmVzZXRBcHAgPSBhc3luYyBmdW5jdGlvbiByZXNldEFwcCAoYWRiLCBvcHRzID0ge30pIHtcbiAgY29uc3Qge1xuICAgIGFwcCxcbiAgICBhcHBQYWNrYWdlLFxuICAgIGZhc3RSZXNldCxcbiAgICBmdWxsUmVzZXQsXG4gICAgYW5kcm9pZEluc3RhbGxUaW1lb3V0ID0gUEFDS0FHRV9JTlNUQUxMX1RJTUVPVVQsXG4gICAgYXV0b0dyYW50UGVybWlzc2lvbnMsXG4gICAgYWxsb3dUZXN0UGFja2FnZXNcbiAgfSA9IG9wdHM7XG5cbiAgaWYgKCFhcHBQYWNrYWdlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiJ2FwcFBhY2thZ2UnIG9wdGlvbiBpcyByZXF1aXJlZFwiKTtcbiAgfVxuXG4gIGNvbnN0IGlzSW5zdGFsbGVkID0gYXdhaXQgYWRiLmlzQXBwSW5zdGFsbGVkKGFwcFBhY2thZ2UpO1xuXG4gIGlmIChpc0luc3RhbGxlZCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBhZGIuZm9yY2VTdG9wKGFwcFBhY2thZ2UpO1xuICAgIH0gY2F0Y2ggKGlnbikge31cbiAgICAvLyBmdWxsUmVzZXQgaGFzIHByaW9yaXR5IG92ZXIgZmFzdFJlc2V0XG4gICAgaWYgKCFmdWxsUmVzZXQgJiYgZmFzdFJlc2V0KSB7XG4gICAgICBjb25zdCBvdXRwdXQgPSBhd2FpdCBhZGIuY2xlYXIoYXBwUGFja2FnZSk7XG4gICAgICBpZiAoXy5pc1N0cmluZyhvdXRwdXQpICYmIG91dHB1dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmYWlsZWQnKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjbGVhciB0aGUgYXBwbGljYXRpb24gZGF0YSBvZiAnJHthcHBQYWNrYWdlfScuIE9yaWdpbmFsIGVycm9yOiAke291dHB1dH1gKTtcbiAgICAgIH1cbiAgICAgIC8vIGV4ZWN1dGluZyBgc2hlbGwgcG0gY2xlYXJgIHJlc2V0cyBwcmV2aW91c2x5IGFzc2lnbmVkIGFwcGxpY2F0aW9uIHBlcm1pc3Npb25zIGFzIHdlbGxcbiAgICAgIGlmIChhdXRvR3JhbnRQZXJtaXNzaW9ucykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGFkYi5ncmFudEFsbFBlcm1pc3Npb25zKGFwcFBhY2thZ2UpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcihgVW5hYmxlIHRvIGdyYW50IHBlcm1pc3Npb25zIHJlcXVlc3RlZC4gT3JpZ2luYWwgZXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbG9nZ2VyLmRlYnVnKGBQZXJmb3JtZWQgZmFzdCByZXNldCBvbiB0aGUgaW5zdGFsbGVkICcke2FwcFBhY2thZ2V9JyBhcHBsaWNhdGlvbiAoc3RvcCBhbmQgY2xlYXIpYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgaWYgKCFhcHApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCInYXBwJyBvcHRpb24gaXMgcmVxdWlyZWQgZm9yIHJlaW5zdGFsbFwiKTtcbiAgfVxuXG4gIGxvZ2dlci5kZWJ1ZyhgUnVubmluZyBmdWxsIHJlc2V0IG9uICcke2FwcFBhY2thZ2V9JyAocmVpbnN0YWxsKWApO1xuICBpZiAoaXNJbnN0YWxsZWQpIHtcbiAgICBhd2FpdCBhZGIudW5pbnN0YWxsQXBrKGFwcFBhY2thZ2UpO1xuICB9XG4gIGF3YWl0IGFkYi5pbnN0YWxsKGFwcCwge1xuICAgIGdyYW50UGVybWlzc2lvbnM6IGF1dG9HcmFudFBlcm1pc3Npb25zLFxuICAgIHRpbWVvdXQ6IGFuZHJvaWRJbnN0YWxsVGltZW91dCxcbiAgICBhbGxvd1Rlc3RQYWNrYWdlcyxcbiAgfSk7XG59O1xuXG5oZWxwZXJzLmluc3RhbGxBcGsgPSBhc3luYyBmdW5jdGlvbiBpbnN0YWxsQXBrIChhZGIsIG9wdHMgPSB7fSkge1xuICBjb25zdCB7XG4gICAgYXBwLFxuICAgIGFwcFBhY2thZ2UsXG4gICAgZmFzdFJlc2V0LFxuICAgIGZ1bGxSZXNldCxcbiAgICBhbmRyb2lkSW5zdGFsbFRpbWVvdXQgPSBQQUNLQUdFX0lOU1RBTExfVElNRU9VVCxcbiAgICBhdXRvR3JhbnRQZXJtaXNzaW9ucyxcbiAgICBhbGxvd1Rlc3RQYWNrYWdlcyxcbiAgICBlbmZvcmNlQXBwSW5zdGFsbCxcbiAgfSA9IG9wdHM7XG5cbiAgaWYgKCFhcHAgfHwgIWFwcFBhY2thZ2UpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCInYXBwJyBhbmQgJ2FwcFBhY2thZ2UnIG9wdGlvbnMgYXJlIHJlcXVpcmVkXCIpO1xuICB9XG5cbiAgaWYgKGZ1bGxSZXNldCkge1xuICAgIGF3YWl0IHRoaXMucmVzZXRBcHAoYWRiLCBvcHRzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7XG4gICAgYXBwU3RhdGUsXG4gICAgd2FzVW5pbnN0YWxsZWRcbiAgfSA9IGF3YWl0IGFkYi5pbnN0YWxsT3JVcGdyYWRlKGFwcCwgYXBwUGFja2FnZSwge1xuICAgIGdyYW50UGVybWlzc2lvbnM6IGF1dG9HcmFudFBlcm1pc3Npb25zLFxuICAgIHRpbWVvdXQ6IGFuZHJvaWRJbnN0YWxsVGltZW91dCxcbiAgICBhbGxvd1Rlc3RQYWNrYWdlcyxcbiAgICBlbmZvcmNlQ3VycmVudEJ1aWxkOiBlbmZvcmNlQXBwSW5zdGFsbCxcbiAgfSk7XG5cbiAgLy8gVGhlcmUgaXMgbm8gbmVlZCB0byByZXNldCB0aGUgbmV3bHkgaW5zdGFsbGVkIGFwcFxuICBjb25zdCBpc0luc3RhbGxlZE92ZXJFeGlzdGluZ0FwcCA9ICF3YXNVbmluc3RhbGxlZFxuICAgICYmIGFwcFN0YXRlICE9PSBhZGIuQVBQX0lOU1RBTExfU1RBVEUuTk9UX0lOU1RBTExFRDtcbiAgaWYgKGZhc3RSZXNldCAmJiBpc0luc3RhbGxlZE92ZXJFeGlzdGluZ0FwcCkge1xuICAgIGxvZ2dlci5pbmZvKGBQZXJmb3JtaW5nIGZhc3QgcmVzZXQgb24gJyR7YXBwUGFja2FnZX0nYCk7XG4gICAgYXdhaXQgdGhpcy5yZXNldEFwcChhZGIsIG9wdHMpO1xuICB9XG59O1xuXG4vKipcbiAqIEluc3RhbGxzIGFuIGFycmF5IG9mIGFwa3NcbiAqIEBwYXJhbSB7QURCfSBhZGIgSW5zdGFuY2Ugb2YgQXBwaXVtIEFEQiBvYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdHMgZGVmaW5lZCBpbiBkcml2ZXIuanNcbiAqL1xuaGVscGVycy5pbnN0YWxsT3RoZXJBcGtzID0gYXN5bmMgZnVuY3Rpb24gaW5zdGFsbE90aGVyQXBrcyAob3RoZXJBcHBzLCBhZGIsIG9wdHMpIHtcbiAgbGV0IHtcbiAgICBhbmRyb2lkSW5zdGFsbFRpbWVvdXQgPSBQQUNLQUdFX0lOU1RBTExfVElNRU9VVCxcbiAgICBhdXRvR3JhbnRQZXJtaXNzaW9ucyxcbiAgICBhbGxvd1Rlc3RQYWNrYWdlc1xuICB9ID0gb3B0cztcblxuICAvLyBJbnN0YWxsIGFsbCBvZiB0aGUgQVBLJ3MgYXN5bmNocm9ub3VzbHlcbiAgYXdhaXQgQi5hbGwob3RoZXJBcHBzLm1hcCgob3RoZXJBcHApID0+IHtcbiAgICBsb2dnZXIuZGVidWcoYEluc3RhbGxpbmcgYXBwOiAke290aGVyQXBwfWApO1xuICAgIHJldHVybiBhZGIuaW5zdGFsbE9yVXBncmFkZShvdGhlckFwcCwgbnVsbCwge1xuICAgICAgZ3JhbnRQZXJtaXNzaW9uczogYXV0b0dyYW50UGVybWlzc2lvbnMsXG4gICAgICB0aW1lb3V0OiBhbmRyb2lkSW5zdGFsbFRpbWVvdXQsXG4gICAgICBhbGxvd1Rlc3RQYWNrYWdlcyxcbiAgICB9KTtcbiAgfSkpO1xufTtcblxuLyoqXG4gKiBVbmluc3RhbGwgYW4gYXJyYXkgb2YgcGFja2FnZXNcbiAqIEBwYXJhbSB7QURCfSBhZGIgSW5zdGFuY2Ugb2YgQXBwaXVtIEFEQiBvYmplY3RcbiAqIEBwYXJhbSB7QXJyYXk8c3RyaW5nPn0gYXBwUGFja2FnZXMgQW4gYXJyYXkgb2YgcGFja2FnZSBuYW1lcyB0byB1bmluc3RhbGwuIElmIHRoaXMgaW5jbHVkZXMgYCcqJ2AsIHVuaW5zdGFsbCBhbGwgb2YgM3JkIHBhcnR5IGFwcHNcbiAqIEBwYXJhbSB7QXJyYXk8c3RyaW5nPn0gZmlsdGVyUGFja2FnZXMgQW4gYXJyYXkgb2YgcGFja2FnZXMgZG9lcyBub3QgdW5pbnN0YWxsIHdoZW4gYCpgIGlzIHByb3ZpZGVkIGFzIGBhcHBQYWNrYWdlc2BcbiAqL1xuaGVscGVycy51bmluc3RhbGxPdGhlclBhY2thZ2VzID0gYXN5bmMgZnVuY3Rpb24gdW5pbnN0YWxsT3RoZXJQYWNrYWdlcyAoYWRiLCBhcHBQYWNrYWdlcywgZmlsdGVyUGFja2FnZXMgPSBbXSkge1xuICBpZiAoYXBwUGFja2FnZXMuaW5jbHVkZXMoJyonKSkge1xuICAgIGxvZ2dlci5kZWJ1ZygnVW5pbnN0YWxsIHRoaXJkIHBhcnR5IHBhY2thZ2VzJyk7XG4gICAgYXBwUGFja2FnZXMgPSBhd2FpdCB0aGlzLmdldFRoaXJkUGFydHlQYWNrYWdlcyhhZGIsIGZpbHRlclBhY2thZ2VzKTtcbiAgfVxuXG4gIGxvZ2dlci5kZWJ1ZyhgVW5pbnN0YWxsaW5nIHBhY2thZ2VzOiAke2FwcFBhY2thZ2VzfWApO1xuICBhd2FpdCBCLmFsbChhcHBQYWNrYWdlcy5tYXAoKGFwcFBhY2thZ2UpID0+IGFkYi51bmluc3RhbGxBcGsoYXBwUGFja2FnZSkpKTtcbn07XG5cbi8qKlxuICogR2V0IHRoaXJkIHBhcnR5IHBhY2thZ2VzIGZpbHRlcmVkIHdpdGggYGZpbHRlclBhY2thZ2VzYFxuICogQHBhcmFtIHtBREJ9IGFkYiBJbnN0YW5jZSBvZiBBcHBpdW0gQURCIG9iamVjdFxuICogQHBhcmFtIHtBcnJheTxzdHJpbmc+fSBmaWx0ZXJQYWNrYWdlcyBBbiBhcnJheSBvZiBwYWNrYWdlcyBkb2VzIG5vdCB1bmluc3RhbGwgd2hlbiBgKmAgaXMgcHJvdmlkZWQgYXMgYGFwcFBhY2thZ2VzYFxuICogQHJldHVybnMge0FycmF5PHN0cmluZz59IEFuIGFycmF5IG9mIGluc3RhbGxlZCB0aGlyZCBwYXJ5IHBhY2thZ2VzXG4gKi9cbmhlbHBlcnMuZ2V0VGhpcmRQYXJ0eVBhY2thZ2VzID0gYXN5bmMgZnVuY3Rpb24gZ2V0VGhpcmRQYXJ0eVBhY2thZ2VzIChhZGIsIGZpbHRlclBhY2thZ2VzID0gW10pIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYWNrYWdlc1N0cmluZyA9IGF3YWl0IGFkYi5zaGVsbChbJ3BtJywgJ2xpc3QnLCAncGFja2FnZXMnLCAnLTMnXSk7XG4gICAgY29uc3QgYXBwUGFja2FnZXNBcnJheSA9IHBhY2thZ2VzU3RyaW5nLnRyaW0oKS5yZXBsYWNlKC9wYWNrYWdlOi9nLCAnJykuc3BsaXQoRU9MKTtcbiAgICBsb2dnZXIuZGVidWcoYCcke2FwcFBhY2thZ2VzQXJyYXl9JyBmaWx0ZXJlZCB3aXRoICcke2ZpbHRlclBhY2thZ2VzfSdgKTtcbiAgICByZXR1cm4gXy5kaWZmZXJlbmNlKGFwcFBhY2thZ2VzQXJyYXksIGZpbHRlclBhY2thZ2VzKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nZ2VyLndhcm4oYFVuYWJsZSB0byBnZXQgcGFja2FnZXMgd2l0aCAnYWRiIHNoZWxsIHBtIGxpc3QgcGFja2FnZXMgLTMnOiAke2Vyci5tZXNzYWdlfWApO1xuICAgIHJldHVybiBbXTtcbiAgfVxufTtcblxuaGVscGVycy5pbml0VW5pY29kZUtleWJvYXJkID0gYXN5bmMgZnVuY3Rpb24gaW5pdFVuaWNvZGVLZXlib2FyZCAoYWRiKSB7XG4gIGxvZ2dlci5kZWJ1ZygnRW5hYmxpbmcgVW5pY29kZSBrZXlib2FyZCBzdXBwb3J0Jyk7XG5cbiAgLy8gZ2V0IHRoZSBkZWZhdWx0IElNRSBzbyB3ZSBjYW4gcmV0dXJuIGJhY2sgdG8gaXQgbGF0ZXIgaWYgd2Ugd2FudFxuICBsZXQgZGVmYXVsdElNRSA9IGF3YWl0IGFkYi5kZWZhdWx0SU1FKCk7XG5cbiAgbG9nZ2VyLmRlYnVnKGBVbnNldHRpbmcgcHJldmlvdXMgSU1FICR7ZGVmYXVsdElNRX1gKTtcbiAgY29uc3QgYXBwaXVtSU1FID0gYCR7U0VUVElOR1NfSEVMUEVSX1BLR19JRH0vLlVuaWNvZGVJTUVgO1xuICBsb2dnZXIuZGVidWcoYFNldHRpbmcgSU1FIHRvICcke2FwcGl1bUlNRX0nYCk7XG4gIGF3YWl0IGFkYi5lbmFibGVJTUUoYXBwaXVtSU1FKTtcbiAgYXdhaXQgYWRiLnNldElNRShhcHBpdW1JTUUpO1xuICByZXR1cm4gZGVmYXVsdElNRTtcbn07XG5cbmhlbHBlcnMuc2V0TW9ja0xvY2F0aW9uQXBwID0gYXN5bmMgZnVuY3Rpb24gc2V0TW9ja0xvY2F0aW9uQXBwIChhZGIsIGFwcCkge1xuICB0cnkge1xuICAgIGlmIChhd2FpdCBhZGIuZ2V0QXBpTGV2ZWwoKSA8IDIzKSB7XG4gICAgICBhd2FpdCBhZGIuc2hlbGwoWydzZXR0aW5ncycsICdwdXQnLCAnc2VjdXJlJywgJ21vY2tfbG9jYXRpb24nLCAnMSddKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgYWRiLnNoZWxsKFsnYXBwb3BzJywgJ3NldCcsIGFwcCwgJ2FuZHJvaWQ6bW9ja19sb2NhdGlvbicsICdhbGxvdyddKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZ2dlci53YXJuKGBVbmFibGUgdG8gc2V0IG1vY2sgbG9jYXRpb24gZm9yIGFwcCAnJHthcHB9JzogJHtlcnIubWVzc2FnZX1gKTtcbiAgfVxufTtcblxuaGVscGVycy5pbnN0YWxsSGVscGVyQXBwID0gYXN5bmMgZnVuY3Rpb24gaW5zdGFsbEhlbHBlckFwcCAoYWRiLCBhcGtQYXRoLCBwYWNrYWdlSWQpIHtcbiAgLy8gU29tZXRpbWVzIGFkYiBwdXNoIG9yIGFkYiBpbnN0YWwgdGFrZSBtb3JlIHRpbWUgdGhhbiBleHBlY3RlZCB0byBpbnN0YWxsIGFuIGFwcFxuICAvLyBlLmcuIGh0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vaW8uYXBwaXVtLnNldHRpbmdzL2lzc3Vlcy80MCNpc3N1ZWNvbW1lbnQtNDc2NTkzMTc0XG4gIGF3YWl0IHJldHJ5KDIsIGFzeW5jIGZ1bmN0aW9uIHJldHJ5SW5zdGFsbEhlbHBlckFwcCAoKSB7XG4gICAgYXdhaXQgYWRiLmluc3RhbGxPclVwZ3JhZGUoYXBrUGF0aCwgcGFja2FnZUlkLCB7Z3JhbnRQZXJtaXNzaW9uczogdHJ1ZX0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogUHVzaGVzIGFuZCBpbnN0YWxscyBpby5hcHBpdW0uc2V0dGluZ3MgYXBwLlxuICogVGhyb3dzIGFuIGVycm9yIGlmIHRoZSBzZXR0aW5nIGFwcCBpcyByZXF1aXJlZFxuICpcbiAqIEBwYXJhbSB7QWRifSBhZGIgLSBUaGUgYWRiIG1vZHVsZSBpbnN0YW5jZS5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gdGhyb3dFcnJvcltmYWxzZV0gLSBXaGV0aGVyIHRocm93IGVycm9yIG9yIG5vdFxuICogQHRocm93cyB7RXJyb3J9IElmIHRocm93RXJyb3IgaXMgdHJ1ZSBhbmQgc29tZXRoaW5nIGhhcHBlbnMgaW4gaW5zdGFsbGF0aW9uIHN0ZXBcbiAqL1xuaGVscGVycy5wdXNoU2V0dGluZ3NBcHAgPSBhc3luYyBmdW5jdGlvbiBwdXNoU2V0dGluZ3NBcHAgKGFkYiwgdGhyb3dFcnJvciA9IGZhbHNlKSB7XG4gIGxvZ2dlci5kZWJ1ZygnUHVzaGluZyBzZXR0aW5ncyBhcGsgdG8gZGV2aWNlLi4uJyk7XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBoZWxwZXJzLmluc3RhbGxIZWxwZXJBcHAoYWRiLCBzZXR0aW5nc0Fwa1BhdGgsIFNFVFRJTkdTX0hFTFBFUl9QS0dfSUQsIHRocm93RXJyb3IpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cblxuICAgIGxvZ2dlci53YXJuKGBJZ25vcmVkIGVycm9yIHdoaWxlIGluc3RhbGxpbmcgJyR7c2V0dGluZ3NBcGtQYXRofSc6IGAgK1xuICAgICAgICAgICAgICAgIGAnJHtlcnIubWVzc2FnZX0nLiBGZWF0dXJlcyB0aGF0IHJlbHkgb24gdGhpcyBoZWxwZXIgYCArXG4gICAgICAgICAgICAgICAgJ3JlcXVpcmUgdGhlIGFwayBzdWNoIGFzIHRvZ2dsZSBXaUZpIGFuZCBnZXR0aW5nIGxvY2F0aW9uICcgK1xuICAgICAgICAgICAgICAgICd3aWxsIHJhaXNlIGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gdXNlIHRoZW0uJyk7XG4gIH1cblxuICAvLyBSZWluc3RhbGwgd2lsbCBzdG9wIHRoZSBzZXR0aW5ncyBoZWxwZXIgcHJvY2VzcyBhbnl3YXksIHNvXG4gIC8vIHRoZXJlIGlzIG5vIG5lZWQgdG8gY29udGludWUgaWYgdGhlIGFwcGxpY2F0aW9uIGlzIHN0aWxsIHJ1bm5pbmdcbiAgaWYgKGF3YWl0IGFkYi5wcm9jZXNzRXhpc3RzKFNFVFRJTkdTX0hFTFBFUl9QS0dfSUQpKSB7XG4gICAgbG9nZ2VyLmRlYnVnKGAke1NFVFRJTkdTX0hFTFBFUl9QS0dfSUR9IGlzIGFscmVhZHkgcnVubmluZy4gYCArXG4gICAgICBgVGhlcmUgaXMgbm8gbmVlZCB0byByZXNldCBpdHMgcGVybWlzc2lvbnMuYCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGF3YWl0IGFkYi5nZXRBcGlMZXZlbCgpIDw9IDIzKSB7IC8vIEFuZHJvaWQgNi0gZGV2aWNlcyBzaG91bGQgaGF2ZSBncmFudGVkIHBlcm1pc3Npb25zXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FwcGl1bS9hcHBpdW0vcHVsbC8xMTY0MCNpc3N1ZWNvbW1lbnQtNDM4MjYwNDc3XG4gICAgbG9nZ2VyLmluZm8oJ0dyYW50aW5nIGFuZHJvaWQucGVybWlzc2lvbi5TRVRfQU5JTUFUSU9OX1NDQUxFLCBDSEFOR0VfQ09ORklHVVJBVElPTiwgQUNDRVNTX0ZJTkVfTE9DQVRJT04gYnkgcG0gZ3JhbnQnKTtcbiAgICBhd2FpdCBhZGIuZ3JhbnRQZXJtaXNzaW9ucyhTRVRUSU5HU19IRUxQRVJfUEtHX0lELCBbXG4gICAgICAnYW5kcm9pZC5wZXJtaXNzaW9uLlNFVF9BTklNQVRJT05fU0NBTEUnLFxuICAgICAgJ2FuZHJvaWQucGVybWlzc2lvbi5DSEFOR0VfQ09ORklHVVJBVElPTicsXG4gICAgICAnYW5kcm9pZC5wZXJtaXNzaW9uLkFDQ0VTU19GSU5FX0xPQ0FUSU9OJ1xuICAgIF0pO1xuICB9XG5cbiAgLy8gbGF1bmNoIGlvLmFwcGl1bS5zZXR0aW5ncyBhcHAgZHVlIHRvIHNldHRpbmdzIGZhaWxpbmcgdG8gYmUgc2V0XG4gIC8vIGlmIHRoZSBhcHAgaXMgbm90IGxhdW5jaGVkIHByaW9yIHRvIHN0YXJ0IHRoZSBzZXNzaW9uIG9uIGFuZHJvaWQgNytcbiAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vYXBwaXVtL2lzc3Vlcy84OTU3XG4gIHRyeSB7XG4gICAgYXdhaXQgYWRiLnN0YXJ0QXBwKHtcbiAgICAgIHBrZzogU0VUVElOR1NfSEVMUEVSX1BLR19JRCxcbiAgICAgIGFjdGl2aXR5OiBTRVRUSU5HU19IRUxQRVJfTUFJTl9BQ1RJVklUWSxcbiAgICAgIGFjdGlvbjogJ2FuZHJvaWQuaW50ZW50LmFjdGlvbi5NQUlOJyxcbiAgICAgIGNhdGVnb3J5OiAnYW5kcm9pZC5pbnRlbnQuY2F0ZWdvcnkuTEFVTkNIRVInLFxuICAgICAgc3RvcEFwcDogZmFsc2UsXG4gICAgICB3YWl0Rm9yTGF1bmNoOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgYWRiLnByb2Nlc3NFeGlzdHMoU0VUVElOR1NfSEVMUEVSX1BLR19JRCksIHtcbiAgICAgIHdhaXRNczogNTAwMCxcbiAgICAgIGludGVydmFsTXM6IDMwMCxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGBGYWlsZWQgdG8gbGF1bmNoIEFwcGl1bSBTZXR0aW5ncyBhcHA6ICR7ZXJyLm1lc3NhZ2V9YDtcbiAgICBlcnIubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgbG9nZ2VyLndhcm4obWVzc2FnZSk7XG4gICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogRXh0cmFjdHMgc3RyaW5nLnhtbCBhbmQgY29udmVydHMgaXQgdG8gc3RyaW5nLmpzb24gYW5kIHB1c2hlc1xuICogaXQgdG8gL2RhdGEvbG9jYWwvdG1wL3N0cmluZy5qc29uIG9uIGZvciB1c2Ugb2YgYm9vdHN0cmFwXG4gKiBJZiBhcHAgaXMgbm90IHByZXNlbnQgdG8gZXh0cmFjdCBzdHJpbmcueG1sIGl0IGRlbGV0ZXMgcmVtb3RlIHN0cmluZ3MuanNvblxuICogSWYgYXBwIGRvZXMgbm90IGhhdmUgc3RyaW5ncy54bWwgd2UgcHVzaCBhbiBlbXB0eSBqc29uIG9iamVjdCB0byByZW1vdGVcbiAqXG4gKiBAcGFyYW0gez9zdHJpbmd9IGxhbmd1YWdlIC0gTGFuZ3VhZ2UgYWJicmV2aWF0aW9uLCBmb3IgZXhhbXBsZSAnZnInLiBUaGUgZGVmYXVsdCBsYW5ndWFnZVxuICogaXMgdXNlZCBpZiB0aGlzIGFyZ3VtZW50IGlzIG5vdCBkZWZpbmVkLlxuICogQHBhcmFtIHtPYmplY3R9IGFkYiAtIFRoZSBhZGIgbW9kdWxlIGluc3RhbmNlLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgLSBEcml2ZXIgb3B0aW9ucyBkaWN0aW9uYXJ5LlxuICogQHJldHVybnMge09iamVjdH0gVGhlIGRpY3Rpb25hcnksIHdoZXJlIHN0cmluZyByZXNvdXJjZSBpZGVudGlmaWVycyBhcmUga2V5c1xuICogYWxvbmcgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHZhbHVlcyBmb3IgdGhlIGdpdmVuIGxhbmd1YWdlIG9yIGFuIGVtcHR5IG9iamVjdFxuICogaWYgbm8gbWF0Y2hpbmcgcmVzb3VyY2VzIHdlcmUgZXh0cmFjdGVkLlxuICovXG5oZWxwZXJzLnB1c2hTdHJpbmdzID0gYXN5bmMgZnVuY3Rpb24gcHVzaFN0cmluZ3MgKGxhbmd1YWdlLCBhZGIsIG9wdHMpIHtcbiAgY29uc3QgcmVtb3RlRGlyID0gJy9kYXRhL2xvY2FsL3RtcCc7XG4gIGNvbnN0IHN0cmluZ3NKc29uID0gJ3N0cmluZ3MuanNvbic7XG4gIGNvbnN0IHJlbW90ZUZpbGUgPSBwYXRoLnBvc2l4LnJlc29sdmUocmVtb3RlRGlyLCBzdHJpbmdzSnNvbik7XG5cbiAgLy8gY2xlYW4gdXAgcmVtb3RlIHN0cmluZy5qc29uIGlmIHByZXNlbnRcbiAgYXdhaXQgYWRiLnJpbXJhZihyZW1vdGVGaWxlKTtcblxuICBsZXQgYXBwO1xuICB0cnkge1xuICAgIGFwcCA9IG9wdHMuYXBwIHx8IGF3YWl0IGFkYi5wdWxsQXBrKG9wdHMuYXBwUGFja2FnZSwgb3B0cy50bXBEaXIpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2dnZXIuaW5mbyhgRmFpbGVkIHRvIHB1bGwgYW4gYXBrIGZyb20gJyR7b3B0cy5hcHBQYWNrYWdlfScgdG8gJyR7b3B0cy50bXBEaXJ9Jy4gT3JpZ2luYWwgZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gIH1cblxuICBpZiAoXy5pc0VtcHR5KG9wdHMuYXBwUGFja2FnZSkgfHwgIShhd2FpdCBmcy5leGlzdHMoYXBwKSkpIHtcbiAgICBsb2dnZXIuZGVidWcoYE5vIGFwcCBvciBwYWNrYWdlIHNwZWNpZmllZC4gUmV0dXJuaW5nIGVtcHR5IHN0cmluZ3NgKTtcbiAgICByZXR1cm4ge307XG4gIH1cblxuICBjb25zdCBzdHJpbmdzVG1wRGlyID0gcGF0aC5yZXNvbHZlKG9wdHMudG1wRGlyLCBvcHRzLmFwcFBhY2thZ2UpO1xuICB0cnkge1xuICAgIGxvZ2dlci5kZWJ1ZygnRXh0cmFjdGluZyBzdHJpbmdzIGZyb20gYXBrJywgYXBwLCBsYW5ndWFnZSwgc3RyaW5nc1RtcERpcik7XG4gICAgY29uc3Qge2Fwa1N0cmluZ3MsIGxvY2FsUGF0aH0gPSBhd2FpdCBhZGIuZXh0cmFjdFN0cmluZ3NGcm9tQXBrKGFwcCwgbGFuZ3VhZ2UsIHN0cmluZ3NUbXBEaXIpO1xuICAgIGF3YWl0IGFkYi5wdXNoKGxvY2FsUGF0aCwgcmVtb3RlRGlyKTtcbiAgICByZXR1cm4gYXBrU3RyaW5ncztcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgbG9nZ2VyLndhcm4oYENvdWxkIG5vdCBnZXQgc3RyaW5ncywgY29udGludWluZyBhbnl3YXkuIE9yaWdpbmFsIGVycm9yOiAke2Vyci5tZXNzYWdlfWApO1xuICAgIGF3YWl0IGFkYi5zaGVsbCgnZWNobycsIFtgJ3t9JyA+ICR7cmVtb3RlRmlsZX1gXSk7XG4gIH0gZmluYWxseSB7XG4gICAgYXdhaXQgZnMucmltcmFmKHN0cmluZ3NUbXBEaXIpO1xuICB9XG4gIHJldHVybiB7fTtcbn07XG5cbmhlbHBlcnMudW5sb2NrV2l0aFVJQXV0b21hdGlvbiA9IGFzeW5jIGZ1bmN0aW9uIHVubG9ja1dpdGhVSUF1dG9tYXRpb24gKGRyaXZlciwgYWRiLCB1bmxvY2tDYXBhYmlsaXRpZXMpIHtcbiAgbGV0IHVubG9ja1R5cGUgPSB1bmxvY2tDYXBhYmlsaXRpZXMudW5sb2NrVHlwZTtcbiAgaWYgKCF1bmxvY2tlci5pc1ZhbGlkVW5sb2NrVHlwZSh1bmxvY2tUeXBlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB1bmxvY2sgdHlwZSAke3VubG9ja1R5cGV9YCk7XG4gIH1cbiAgbGV0IHVubG9ja0tleSA9IHVubG9ja0NhcGFiaWxpdGllcy51bmxvY2tLZXk7XG4gIGlmICghdW5sb2NrZXIuaXNWYWxpZEtleSh1bmxvY2tUeXBlLCB1bmxvY2tLZXkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIHVubG9ja0tleSAke3VubG9ja0tleX0gY2FwYWJpbGl0eSBmb3IgdW5sb2NrVHlwZSAke3VubG9ja1R5cGV9YCk7XG4gIH1cbiAgY29uc3QgdW5sb2NrTWV0aG9kID0ge1xuICAgIFtQSU5fVU5MT0NLXTogdW5sb2NrZXIucGluVW5sb2NrLFxuICAgIFtQQVNTV09SRF9VTkxPQ0tdOiB1bmxvY2tlci5wYXNzd29yZFVubG9jayxcbiAgICBbUEFUVEVSTl9VTkxPQ0tdOiB1bmxvY2tlci5wYXR0ZXJuVW5sb2NrLFxuICAgIFtGSU5HRVJQUklOVF9VTkxPQ0tdOiB1bmxvY2tlci5maW5nZXJwcmludFVubG9ja1xuICB9W3VubG9ja1R5cGVdO1xuICBhd2FpdCB1bmxvY2tNZXRob2QoYWRiLCBkcml2ZXIsIHVubG9ja0NhcGFiaWxpdGllcyk7XG59O1xuXG5oZWxwZXJzLnVubG9ja1dpdGhIZWxwZXJBcHAgPSBhc3luYyBmdW5jdGlvbiB1bmxvY2tXaXRoSGVscGVyQXBwIChhZGIpIHtcbiAgbG9nZ2VyLmluZm8oJ1VubG9ja2luZyBzY3JlZW4nKTtcblxuICAvLyBVbmxvY2sgc3VjY2VlZCB3aXRoIGEgY291cGxlIG9mIHJldHJpZXMuXG4gIGxldCBmaXJzdFJ1biA9IHRydWU7XG4gIGF3YWl0IHJldHJ5KDMsIGFzeW5jIGZ1bmN0aW9uIGxhdW5jaEhlbHBlciAoKSB7XG4gICAgLy8gVG8gcmVkdWNlIGEgdGltZSB0byBjYWxsIGFkYi5pc1NjcmVlbkxvY2tlZCgpIHNpbmNlIGBhZGIgc2hlbGwgZHVtcHN5cyB3aW5kb3dgIGlzIGVhc3kgdG8gaGFuZyBhZGIgY29tbWFuZHNcbiAgICBpZiAoZmlyc3RSdW4pIHtcbiAgICAgIGZpcnN0UnVuID0gZmFsc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghKGF3YWl0IGFkYi5pc1NjcmVlbkxvY2tlZCgpKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIud2FybihgRXJyb3IgaW4gaXNTY3JlZW5Mb2NrZWQ6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICBsb2dnZXIud2FybignXCJhZGIgc2hlbGwgZHVtcHN5cyB3aW5kb3dcIiBjb21tYW5kIGhhcyB0aW1lZCBvdXQuJyk7XG4gICAgICAgIGxvZ2dlci53YXJuKCdUaGUgcmVhc29uIG9mIHRoaXMgdGltZW91dCBpcyB0aGUgZGVsYXllZCBhZGIgcmVzcG9uc2UuIFJlc2V0dGluZyBhZGIgc2VydmVyIGNhbiBpbXByb3ZlIGl0LicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxvZ2dlci5pbmZvKGBMYXVuY2hpbmcgJHtTRVRUSU5HU19IRUxQRVJfVU5MT0NLX0FDVElWSVRZfWApO1xuICAgIGF3YWl0IGFkYi5zaGVsbChbXG4gICAgICAnYW0nLCAnc3RhcnQnLFxuICAgICAgJy1uJywgYCR7U0VUVElOR1NfSEVMUEVSX1BLR19JRH0vJHtTRVRUSU5HU19IRUxQRVJfVU5MT0NLX0FDVElWSVRZfWAsXG4gICAgICAnLWMnLCAnYW5kcm9pZC5pbnRlbnQuY2F0ZWdvcnkuTEFVTkNIRVInLFxuICAgICAgJy1hJywgJ2FuZHJvaWQuaW50ZW50LmFjdGlvbi5NQUlOJyxcbiAgICAgICctZicsICcweDEwMjAwMDAwJyxcbiAgICBdKTtcbiAgICBhd2FpdCBCLmRlbGF5KDEwMDApO1xuICB9KTtcbn07XG5cbmhlbHBlcnMudW5sb2NrID0gYXN5bmMgZnVuY3Rpb24gdW5sb2NrIChkcml2ZXIsIGFkYiwgY2FwYWJpbGl0aWVzKSB7XG4gIGlmICghKGF3YWl0IGFkYi5pc1NjcmVlbkxvY2tlZCgpKSkge1xuICAgIGxvZ2dlci5pbmZvKCdTY3JlZW4gYWxyZWFkeSB1bmxvY2tlZCwgZG9pbmcgbm90aGluZycpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxvZ2dlci5kZWJ1ZygnU2NyZWVuIGlzIGxvY2tlZCwgdHJ5aW5nIHRvIHVubG9jaycpO1xuICBpZiAoXy5pc1VuZGVmaW5lZChjYXBhYmlsaXRpZXMudW5sb2NrVHlwZSkpIHtcbiAgICBsb2dnZXIud2FybignVXNpbmcgYXBwIHVubG9jaywgdGhpcyBpcyBnb2luZyB0byBiZSBkZXByZWNhdGVkIScpO1xuICAgIGF3YWl0IGhlbHBlcnMudW5sb2NrV2l0aEhlbHBlckFwcChhZGIpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IGhlbHBlcnMudW5sb2NrV2l0aFVJQXV0b21hdGlvbihkcml2ZXIsIGFkYiwge3VubG9ja1R5cGU6IGNhcGFiaWxpdGllcy51bmxvY2tUeXBlLCB1bmxvY2tLZXk6IGNhcGFiaWxpdGllcy51bmxvY2tLZXl9KTtcbiAgICBhd2FpdCBoZWxwZXJzLnZlcmlmeVVubG9jayhhZGIpO1xuICB9XG59O1xuXG5oZWxwZXJzLnZlcmlmeVVubG9jayA9IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeVVubG9jayAoYWRiKSB7XG4gIGF3YWl0IHJldHJ5SW50ZXJ2YWwoMiwgMTAwMCwgYXN5bmMgKCkgPT4ge1xuICAgIGlmIChhd2FpdCBhZGIuaXNTY3JlZW5Mb2NrZWQoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTY3JlZW4gZGlkIG5vdCB1bmxvY2sgc3VjY2Vzc2Z1bGx5LCByZXRyeWluZycpO1xuICAgIH1cbiAgICBsb2dnZXIuZGVidWcoJ1NjcmVlbiB1bmxvY2tlZCBzdWNjZXNzZnVsbHknKTtcbiAgfSk7XG59O1xuXG5oZWxwZXJzLmluaXREZXZpY2UgPSBhc3luYyBmdW5jdGlvbiBpbml0RGV2aWNlIChhZGIsIG9wdHMpIHtcbiAgaWYgKG9wdHMuc2tpcERldmljZUluaXRpYWxpemF0aW9uKSB7XG4gICAgbG9nZ2VyLmluZm8oYCdza2lwRGV2aWNlSW5pdGlhbGl6YXRpb24nIGlzIHNldC4gU2tpcHBpbmcgZGV2aWNlIGluaXRpYWxpemF0aW9uLmApO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IGFkYi53YWl0Rm9yRGV2aWNlKCk7XG4gICAgLy8gcHVzaFNldHRpbmdzQXBwIHJlcXVpcmVkIGJlZm9yZSBjYWxsaW5nIGVuc3VyZURldmljZUxvY2FsZSBmb3IgQVBJIExldmVsIDI0K1xuXG4gICAgLy8gU29tZSBmZWF0dXJlIHN1Y2ggYXMgbG9jYXRpb24vd2lmaSBhcmUgbm90IG5lY2Vzc2FyeSBmb3IgYWxsIHVzZXJzLFxuICAgIC8vIGJ1dCB0aGV5IHJlcXVpcmUgdGhlIHNldHRpbmdzIGFwcC4gU28sIHRyeSB0byBjb25maWd1cmUgaXQgd2hpbGUgQXBwaXVtXG4gICAgLy8gZG9lcyBub3QgdGhyb3cgZXJyb3IgZXZlbiBpZiB0aGV5IGZhaWwuXG4gICAgY29uc3Qgc2hvdWxkVGhyb3dFcnJvciA9IG9wdHMubGFuZ3VhZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgb3B0cy5sb2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgb3B0cy5sb2NhbGVTY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgb3B0cy51bmljb2RlS2V5Ym9hcmRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgb3B0cy5kaXNhYmxlV2luZG93QW5pbWF0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICFvcHRzLnNraXBVbmxvY2s7XG4gICAgYXdhaXQgaGVscGVycy5wdXNoU2V0dGluZ3NBcHAoYWRiLCBzaG91bGRUaHJvd0Vycm9yKTtcbiAgfVxuXG4gIGlmICghb3B0cy5hdmQpIHtcbiAgICBhd2FpdCBoZWxwZXJzLnNldE1vY2tMb2NhdGlvbkFwcChhZGIsIFNFVFRJTkdTX0hFTFBFUl9QS0dfSUQpO1xuICB9XG5cbiAgaWYgKG9wdHMubGFuZ3VhZ2UgfHwgb3B0cy5sb2NhbGUpIHtcbiAgICBhd2FpdCBoZWxwZXJzLmVuc3VyZURldmljZUxvY2FsZShhZGIsIG9wdHMubGFuZ3VhZ2UsIG9wdHMubG9jYWxlLCBvcHRzLmxvY2FsZVNjcmlwdCk7XG4gIH1cblxuICBpZiAob3B0cy5za2lwTG9nY2F0Q2FwdHVyZSkge1xuICAgIGxvZ2dlci5pbmZvKGAnc2tpcExvZ2NhdENhcHR1cmUnIGlzIHNldC4gU2tpcHBpbmcgc3RhcnRpbmcgbG9nY2F0IGNhcHR1cmUuYCk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgYWRiLnN0YXJ0TG9nY2F0KCk7XG4gIH1cblxuICBpZiAob3B0cy51bmljb2RlS2V5Ym9hcmQpIHtcbiAgICByZXR1cm4gYXdhaXQgaGVscGVycy5pbml0VW5pY29kZUtleWJvYXJkKGFkYik7XG4gIH1cbn07XG5cbmhlbHBlcnMucmVtb3ZlTnVsbFByb3BlcnRpZXMgPSBmdW5jdGlvbiByZW1vdmVOdWxsUHJvcGVydGllcyAob2JqKSB7XG4gIGZvciAobGV0IGtleSBvZiBfLmtleXMob2JqKSkge1xuICAgIGlmIChfLmlzTnVsbChvYmpba2V5XSkgfHwgXy5pc1VuZGVmaW5lZChvYmpba2V5XSkpIHtcbiAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICB9XG4gIH1cbn07XG5cbmhlbHBlcnMudHJ1bmNhdGVEZWNpbWFscyA9IGZ1bmN0aW9uIHRydW5jYXRlRGVjaW1hbHMgKG51bWJlciwgZGlnaXRzKSB7XG4gIGxldCBtdWx0aXBsaWVyID0gTWF0aC5wb3coMTAsIGRpZ2l0cyksXG4gICAgICBhZGp1c3RlZE51bSA9IG51bWJlciAqIG11bHRpcGxpZXIsXG4gICAgICB0cnVuY2F0ZWROdW0gPSBNYXRoW2FkanVzdGVkTnVtIDwgMCA/ICdjZWlsJyA6ICdmbG9vciddKGFkanVzdGVkTnVtKTtcblxuICByZXR1cm4gdHJ1bmNhdGVkTnVtIC8gbXVsdGlwbGllcjtcbn07XG5cbmhlbHBlcnMuaXNDaHJvbWVCcm93c2VyID0gZnVuY3Rpb24gaXNDaHJvbWVCcm93c2VyIChicm93c2VyKSB7XG4gIHJldHVybiBfLmluY2x1ZGVzKE9iamVjdC5rZXlzKENIUk9NRV9CUk9XU0VSX1BBQ0tBR0VfQUNUSVZJVFkpLCAoYnJvd3NlciB8fCAnJykudG9Mb3dlckNhc2UoKSk7XG59O1xuXG5oZWxwZXJzLmdldENocm9tZVBrZyA9IGZ1bmN0aW9uIGdldENocm9tZVBrZyAoYnJvd3Nlcikge1xuICByZXR1cm4gQ0hST01FX0JST1dTRVJfUEFDS0FHRV9BQ1RJVklUWVticm93c2VyLnRvTG93ZXJDYXNlKCldIHx8IENIUk9NRV9CUk9XU0VSX1BBQ0tBR0VfQUNUSVZJVFkuZGVmYXVsdDtcbn07XG5cbmhlbHBlcnMucmVtb3ZlQWxsU2Vzc2lvbldlYlNvY2tldEhhbmRsZXJzID0gYXN5bmMgZnVuY3Rpb24gcmVtb3ZlQWxsU2Vzc2lvbldlYlNvY2tldEhhbmRsZXJzIChzZXJ2ZXIsIHNlc3Npb25JZCkge1xuICBpZiAoIXNlcnZlciB8fCAhXy5pc0Z1bmN0aW9uKHNlcnZlci5nZXRXZWJTb2NrZXRIYW5kbGVycykpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhY3RpdmVIYW5kbGVycyA9IGF3YWl0IHNlcnZlci5nZXRXZWJTb2NrZXRIYW5kbGVycyhzZXNzaW9uSWQpO1xuICBmb3IgKGNvbnN0IHBhdGhuYW1lIG9mIF8ua2V5cyhhY3RpdmVIYW5kbGVycykpIHtcbiAgICBhd2FpdCBzZXJ2ZXIucmVtb3ZlV2ViU29ja2V0SGFuZGxlcihwYXRobmFtZSk7XG4gIH1cbn07XG5cbi8qKlxuICogVGFrZXMgYSBkZXNpcmVkIGNhcGFiaWxpdHkgYW5kIHRyaWVzIHRvIEpTT04ucGFyc2UgaXQgYXMgYW4gYXJyYXksXG4gKiBhbmQgZWl0aGVyIHJldHVybnMgdGhlIHBhcnNlZCBhcnJheSBvciBhIHNpbmdsZXRvbiBhcnJheS5cbiAqXG4gKiBAcGFyYW0ge2FueX0gY2FwIEEgZGVzaXJlZCBjYXBhYmlsaXR5XG4gKi9cbmhlbHBlcnMucGFyc2VBcnJheSA9IGZ1bmN0aW9uIHBhcnNlQXJyYXkgKGNhcCkge1xuICBsZXQgcGFyc2VkQ2FwcztcbiAgdHJ5IHtcbiAgICBwYXJzZWRDYXBzID0gSlNPTi5wYXJzZShjYXApO1xuICB9IGNhdGNoIChpZ24pIHsgfVxuXG4gIGlmIChfLmlzQXJyYXkocGFyc2VkQ2FwcykpIHtcbiAgICByZXR1cm4gcGFyc2VkQ2FwcztcbiAgfSBlbHNlIGlmIChfLmlzU3RyaW5nKGNhcCkpIHtcbiAgICByZXR1cm4gW2NhcF07XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoYG11c3QgcHJvdmlkZSBhIHN0cmluZyBvciBKU09OIEFycmF5OyByZWNlaXZlZCAke2NhcH1gKTtcbn07XG5cbi8qKlxuICogVmFsaWRhdGUgZGVzaXJlZCBjYXBhYmlsaXRpZXMuIFJldHVybnMgdHJ1ZSBpZiBjYXBhYmlsaXR5IGlzIHZhbGlkXG4gKlxuICogQHBhcmFtIHsqfSBjYXAgQSBkZXNpcmVkIGNhcGFiaWxpdHlcbiAqIEByZXR1cm4ge2Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgY2FwYWJpbGl0eSBpcyB2YWxpZFxuICogQHRocm93cyB7RXJyb3J9IElmIHRoZSBjYXBzIGhhcyBpbnZhbGlkIGNhcGFiaWxpdHlcbiAqL1xuaGVscGVycy52YWxpZGF0ZURlc2lyZWRDYXBzID0gZnVuY3Rpb24gdmFsaWRhdGVEZXNpcmVkQ2FwcyAoY2Fwcykge1xuICBpZiAoY2Fwcy5icm93c2VyTmFtZSkge1xuICAgIGlmIChjYXBzLmFwcCkge1xuICAgICAgLy8gd2FybiBpZiB0aGUgY2FwYWJpbGl0aWVzIGhhdmUgYm90aCBgYXBwYCBhbmQgYGJyb3dzZXIsIGFsdGhvdWdoIHRoaXMgaXMgY29tbW9uIHdpdGggc2VsZW5pdW0gZ3JpZFxuICAgICAgbG9nZ2VyLndhcm4oYFRoZSBkZXNpcmVkIGNhcGFiaWxpdGllcyBzaG91bGQgZ2VuZXJhbGx5IG5vdCBpbmNsdWRlIGJvdGggYW4gJ2FwcCcgYW5kIGEgJ2Jyb3dzZXJOYW1lJ2ApO1xuICAgIH1cbiAgICBpZiAoY2Fwcy5hcHBQYWNrYWdlKSB7XG4gICAgICBsb2dnZXIuZXJyb3JBbmRUaHJvdyhgVGhlIGRlc2lyZWQgc2hvdWxkIG5vdCBpbmNsdWRlIGJvdGggb2YgYW4gJ2FwcFBhY2thZ2UnIGFuZCBhICdicm93c2VyTmFtZSdgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoY2Fwcy51bmluc3RhbGxPdGhlclBhY2thZ2VzKSB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMucGFyc2VBcnJheShjYXBzLnVuaW5zdGFsbE90aGVyUGFja2FnZXMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvckFuZFRocm93KGBDb3VsZCBub3QgcGFyc2UgXCJ1bmluc3RhbGxPdGhlclBhY2thZ2VzXCIgY2FwYWJpbGl0eTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5oZWxwZXJzLmJvb3RzdHJhcCA9IEJvb3RzdHJhcDtcbmhlbHBlcnMudW5sb2NrZXIgPSB1bmxvY2tlcjtcblxuZXhwb3J0IHsgaGVscGVycywgU0VUVElOR1NfSEVMUEVSX1BLR19JRCB9O1xuZXhwb3J0IGRlZmF1bHQgaGVscGVycztcbiJdLCJmaWxlIjoibGliL2FuZHJvaWQtaGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLiJ9
