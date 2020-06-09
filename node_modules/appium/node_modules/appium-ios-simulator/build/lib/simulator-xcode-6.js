"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard");

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SPRINGBOARD_BUNDLE_ID = exports.BOOT_COMPLETED_EVENT = exports.SimulatorXcode6 = exports.default = void 0;

require("source-map-support/register");

var _path = _interopRequireDefault(require("path"));

var simctl = _interopRequireWildcard(require("node-simctl"));

var _appiumXcode = _interopRequireWildcard(require("appium-xcode"));

var _logger = _interopRequireDefault(require("./logger"));

var _appiumSupport = require("appium-support");

var _bluebird = _interopRequireDefault(require("bluebird"));

var _lodash = _interopRequireDefault(require("lodash"));

var _asyncLock = _interopRequireDefault(require("async-lock"));

var _utils = require("./utils.js");

var _asyncbox = require("asyncbox");

var settings = _interopRequireWildcard(require("./settings"));

var _teen_process = require("teen_process");

var _tailUntil = require("./tail-until.js");

var _index = _interopRequireDefault(require("./extensions/index"));

var _events = require("events");

var _calendar = _interopRequireDefault(require("./calendar"));

var _permissions = _interopRequireDefault(require("./permissions"));

const STARTUP_TIMEOUT = 60 * 1000;
const EXTRA_STARTUP_TIME = 2000;
const UI_CLIENT_ACCESS_GUARD = new _asyncLock.default();
const UI_CLIENT_BUNDLE_ID = 'com.apple.iphonesimulator';
const SPRINGBOARD_BUNDLE_ID = 'com.apple.SpringBoard';
exports.SPRINGBOARD_BUNDLE_ID = SPRINGBOARD_BUNDLE_ID;
const BOOT_COMPLETED_EVENT = 'bootCompleted';
exports.BOOT_COMPLETED_EVENT = BOOT_COMPLETED_EVENT;

class SimulatorXcode6 extends _events.EventEmitter {
  constructor(udid, xcodeVersion) {
    super();
    this.udid = String(udid);
    this.xcodeVersion = xcodeVersion;
    this._platformVersion = null;
    this.keychainPath = _path.default.resolve(this.getDir(), 'Library', 'Keychains');
    this.simulatorApp = 'iOS Simulator.app';
    this.appDataBundlePaths = {};
    this.isFreshFiles = ['Library/ConfigurationProfiles', 'Library/Cookies', 'Library/Preferences/.GlobalPreferences.plist', 'Library/Preferences/com.apple.springboard.plist', 'var/run/syslog.pid'];
    this.extraStartupTime = EXTRA_STARTUP_TIME;
    this.calendar = new _calendar.default(xcodeVersion, this.getDir());
    this.permissions = new _permissions.default(xcodeVersion, this.getDir(), this.udid);
  }

  get uiClientBundleId() {
    return UI_CLIENT_BUNDLE_ID;
  }

  async getUIClientPid() {
    let stdout;

    try {
      ({
        stdout
      } = await (0, _teen_process.exec)('pgrep', ['-fn', `${this.simulatorApp}/Contents/MacOS/`]));
    } catch (e) {
      return null;
    }

    if (isNaN(parseInt(stdout, 10))) {
      return null;
    }

    stdout = stdout.trim();

    _logger.default.debug(`Got Simulator UI client PID: ${stdout}`);

    return stdout;
  }

  async isUIClientRunning() {
    return !_lodash.default.isNull((await this.getUIClientPid()));
  }

  get startupTimeout() {
    return STARTUP_TIMEOUT;
  }

  async getPlatformVersion() {
    if (!this._platformVersion) {
      let {
        sdk
      } = await this.stat();
      this._platformVersion = sdk;
    }

    return this._platformVersion;
  }

  getRootDir() {
    let home = process.env.HOME;
    return _path.default.resolve(home, 'Library', 'Developer', 'CoreSimulator', 'Devices');
  }

  getDir() {
    return _path.default.resolve(this.getRootDir(), this.udid, 'data');
  }

  getLogDir() {
    let home = process.env.HOME;
    return _path.default.resolve(home, 'Library', 'Logs', 'CoreSimulator', this.udid);
  }

  async installApp(app) {
    return await simctl.installApp(this.udid, app);
  }

  async isAppInstalled(bundleId, appFile = null) {
    let appDirs = await this.getAppDirs(appFile, bundleId);
    return appDirs.length !== 0;
  }

  async getUserInstalledBundleIdsByBundleName(bundleName) {
    const rootUserAppDir = await this.buildBundlePathMap('Bundle');
    const bundleIds = [];

    if (_lodash.default.isEmpty(rootUserAppDir)) {
      return bundleIds;
    }

    for (const [bundleId, userAppDirPath] of Object.entries(rootUserAppDir)) {
      const appFile = (await _appiumSupport.fs.readdir(userAppDirPath)).find(file => _path.default.extname(file).toLowerCase() === '.app');

      const infoPlistPath = _path.default.resolve(userAppDirPath, appFile, 'Info.plist');

      if (!(await _appiumSupport.fs.exists(infoPlistPath))) {
        continue;
      }

      try {
        const infoPlist = await _appiumSupport.plist.parsePlistFile(infoPlistPath, false);

        if (infoPlist.CFBundleName === bundleName) {
          bundleIds.push(bundleId);
        }
      } catch (err) {
        _logger.default.warn(`Failed to read plist ${infoPlistPath}. Original error '${err.message}'`);

        continue;
      }
    }

    _logger.default.debug(`The simulator has '${bundleIds}' which have '${bundleName}' as their 'CFBundleName'`);

    return bundleIds;
  }

  async getAppDir(id, subDir = 'Data') {
    this.appDataBundlePaths[subDir] = this.appDataBundlePaths[subDir] || {};

    if (_lodash.default.isEmpty(this.appDataBundlePaths[subDir]) && !(await this.isFresh())) {
      this.appDataBundlePaths[subDir] = await this.buildBundlePathMap(subDir);
    }

    return this.appDataBundlePaths[subDir][id];
  }

  async buildBundlePathMap(subDir = 'Data') {
    _logger.default.debug('Building bundle path map');

    let applicationList;
    let pathBundlePair;

    if ((await this.getPlatformVersion()) === '7.1') {
      applicationList = _path.default.resolve(this.getDir(), 'Applications');

      pathBundlePair = async dir => {
        dir = _path.default.resolve(applicationList, dir);
        let appFiles = await _appiumSupport.fs.glob(`${dir}/*.app`);
        let bundleId = appFiles[0].match(/.*\/(.*)\.app/)[1];
        return {
          path: dir,
          bundleId
        };
      };
    } else {
      applicationList = _path.default.resolve(this.getDir(), 'Containers', subDir, 'Application');

      let readBundleId = async dir => {
        let plist = _path.default.resolve(dir, '.com.apple.mobile_container_manager.metadata.plist');

        let metadata = await settings.read(plist);
        return metadata.MCMMetadataIdentifier;
      };

      pathBundlePair = async dir => {
        dir = _path.default.resolve(applicationList, dir);
        let bundleId = await readBundleId(dir);
        return {
          path: dir,
          bundleId
        };
      };
    }

    if (!(await _appiumSupport.fs.exists(applicationList))) {
      _logger.default.warn(`No directory path '${applicationList}'`);

      return {};
    }

    let bundlePathDirs = await _appiumSupport.fs.readdir(applicationList);
    let bundlePathPairs = await (0, _asyncbox.asyncmap)(bundlePathDirs, async dir => {
      return await pathBundlePair(dir);
    }, false);
    return bundlePathPairs.reduce((bundleMap, bundlePath) => {
      bundleMap[bundlePath.bundleId] = bundlePath.path;
      return bundleMap;
    }, {});
  }

  async stat() {
    for (let [sdk, deviceArr] of _lodash.default.toPairs((await simctl.getDevices()))) {
      for (let device of deviceArr) {
        if (device.udid === this.udid) {
          device.sdk = sdk;
          return device;
        }
      }
    }

    return {};
  }

  async isFresh() {
    let files = this.isFreshFiles;
    let pv = await this.getPlatformVersion();

    if (pv !== '7.1') {
      files.push('Library/Preferences/com.apple.Preferences.plist');
    } else {
      files.push('Applications');
    }

    const dir = this.getDir();
    files = files.map(s => _path.default.resolve(dir, s));
    const existences = await (0, _asyncbox.asyncmap)(files, async f => await _appiumSupport.fs.hasAccess(f));
    const fresh = _lodash.default.compact(existences).length !== files.length;

    _logger.default.debug(`Checking whether simulator has been run before: ${fresh ? 'no' : 'yes'}`);

    return fresh;
  }

  async isRunning() {
    let stat = await this.stat();
    return stat.state === 'Booted';
  }

  async waitForBoot(startupTimeout) {
    let bootedIndicator = await this.getBootedIndicatorString();
    await this.tailLogsUntil(bootedIndicator, startupTimeout);

    _logger.default.debug(`Waiting an extra ${this.extraStartupTime}ms for the simulator to really finish booting`);

    await _bluebird.default.delay(this.extraStartupTime);

    _logger.default.debug('Done waiting extra time for simulator');

    this.emit(BOOT_COMPLETED_EVENT);
  }

  async getBootedIndicatorString() {
    let indicator;
    let platformVersion = await this.getPlatformVersion();

    switch (platformVersion) {
      case '7.1':
      case '8.1':
      case '8.2':
      case '8.3':
      case '8.4':
        indicator = 'profiled: Service starting...';
        break;

      case '9.0':
      case '9.1':
      case '9.2':
      case '9.3':
        indicator = 'System app "com.apple.springboard" finished startup';
        break;

      case '10.0':
        indicator = 'Switching to keyboard';
        break;

      default:
        _logger.default.warn(`No boot indicator case for platform version '${platformVersion}'`);

        indicator = 'no boot indicator string available';
    }

    return indicator;
  }

  async startUIClient(opts = {}) {
    opts = Object.assign({
      scaleFactor: null,
      connectHardwareKeyboard: false,
      startupTimeout: this.startupTimeout
    }, opts);

    const simulatorApp = _path.default.resolve((await (0, _appiumXcode.getPath)()), 'Applications', this.simulatorApp);

    const args = ['-Fn', simulatorApp, '--args', '-CurrentDeviceUDID', this.udid];

    if (opts.scaleFactor) {
      const stat = await this.stat();
      const formattedDeviceName = stat.name.replace(/\s+/g, '-');
      const argumentName = `-SimulatorWindowLastScale-com.apple.CoreSimulator.SimDeviceType.${formattedDeviceName}`;
      args.push(argumentName, opts.scaleFactor);
    }

    if (_lodash.default.isBoolean(opts.connectHardwareKeyboard)) {
      args.push('-ConnectHardwareKeyboard', opts.connectHardwareKeyboard ? '1' : '0');
    }

    _logger.default.info(`Starting Simulator UI with command: open ${args.join(' ')}`);

    try {
      await (0, _teen_process.exec)('open', args, {
        timeout: opts.startupTimeout
      });
    } catch (err) {
      if (!(err.stdout || '').includes('-10825') && !(err.stderr || '').includes('-10825')) {
        throw err;
      }

      _logger.default.warn(`Error while opening UI: ${err.stdout || err.stderr}. Continuing`);
    }
  }

  async run(opts = {}) {
    opts = Object.assign({
      startupTimeout: this.startupTimeout
    }, opts);
    const {
      state
    } = await this.stat();
    const isServerRunning = state === 'Booted';
    const isUIClientRunning = await this.isUIClientRunning();

    if (isServerRunning && isUIClientRunning) {
      _logger.default.info(`Both Simulator with UDID ${this.udid} and the UI client are currently running`);

      return;
    }

    const startTime = process.hrtime();

    try {
      await this.shutdown();
    } catch (err) {
      _logger.default.warn(`Error on Simulator shutdown: ${err.message}`);
    }

    await this.startUIClient(opts);
    await this.waitForBoot(opts.startupTimeout);

    _logger.default.info(`Simulator with UDID ${this.udid} booted in ${process.hrtime(startTime)[0]} seconds`);
  }

  async clean() {
    await this.endSimulatorDaemon();

    _logger.default.info(`Cleaning simulator ${this.udid}`);

    await simctl.eraseDevice(this.udid, 10000);
  }

  async scrubCustomApp(appFile, appBundleId) {
    return await this.cleanCustomApp(appFile, appBundleId, true);
  }

  async cleanCustomApp(appFile, appBundleId, scrub = false) {
    _logger.default.debug(`Cleaning app data files for '${appFile}', '${appBundleId}'`);

    if (!scrub) {
      _logger.default.debug(`Deleting app altogether`);
    }

    let appDirs = await this.getAppDirs(appFile, appBundleId, scrub);

    if (appDirs.length === 0) {
      _logger.default.debug('Could not find app directories to delete. It is probably not installed');

      return;
    }

    let deletePromises = [];

    for (let dir of appDirs) {
      _logger.default.debug(`Deleting directory: '${dir}'`);

      deletePromises.push(_appiumSupport.fs.rimraf(dir));
    }

    if ((await this.getPlatformVersion()) >= 8) {
      let relRmPath = `Library/Preferences/${appBundleId}.plist`;

      let rmPath = _path.default.resolve(this.getRootDir(), relRmPath);

      _logger.default.debug(`Deleting file: '${rmPath}'`);

      deletePromises.push(_appiumSupport.fs.rimraf(rmPath));
    }

    await _bluebird.default.all(deletePromises);
  }

  async getAppDirs(appFile, appBundleId, scrub = false) {
    let dirs = [];

    if ((await this.getPlatformVersion()) >= 8) {
      let data = await this.getAppDir(appBundleId);
      if (!data) return dirs;
      let bundle = !scrub ? await this.getAppDir(appBundleId, 'Bundle') : undefined;

      for (let src of [data, bundle]) {
        if (src) {
          dirs.push(src);
        }
      }
    } else {
      let data = await this.getAppDir(appFile);

      if (data) {
        dirs.push(data);
      }
    }

    return dirs;
  }

  async launchAndQuit(safari = false, startupTimeout = this.startupTimeout) {
    _logger.default.debug('Attempting to launch and quit the simulator, to create directory structure');

    _logger.default.debug(`Will launch with Safari? ${safari}`);

    await this.run(startupTimeout);

    if (safari) {
      await this.openUrl('http://www.appium.io');
    }

    try {
      await (0, _asyncbox.retryInterval)(60, 250, async () => {
        if (await this.isFresh()) {
          throw new Error('Simulator files not fully created. Waiting a bit');
        }
      });
    } catch (err) {
      _logger.default.warn(`Timeout waiting for simulator files to be created. Continuing`);
    }

    await this.shutdown();
  }

  async endSimulatorDaemon() {
    _logger.default.debug(`Killing any simulator daemons for ${this.udid}`);

    let launchctlCmd = `launchctl list | grep ${this.udid} | cut -f 3 | xargs -n 1 launchctl`;

    try {
      let stopCmd = `${launchctlCmd} stop`;
      await (0, _teen_process.exec)('bash', ['-c', stopCmd]);
    } catch (err) {
      _logger.default.warn(`Could not stop simulator daemons: ${err.message}`);

      _logger.default.debug('Carrying on anyway!');
    }

    try {
      let removeCmd = `${launchctlCmd} remove`;
      await (0, _teen_process.exec)('bash', ['-c', removeCmd]);
    } catch (err) {
      _logger.default.warn(`Could not remove simulator daemons: ${err.message}`);

      _logger.default.debug('Carrying on anyway!');
    }

    try {
      await (0, _asyncbox.waitForCondition)(async () => {
        let {
          stdout
        } = await (0, _teen_process.exec)('bash', ['-c', `ps -e  | grep ${this.udid} | grep launchd_sim | grep -v bash | grep -v grep | awk {'print$1'}`]);
        return stdout.trim().length === 0;
      }, {
        waitMs: 10000,
        intervalMs: 500
      });
    } catch (err) {
      _logger.default.warn(`Could not end simulator daemon for ${this.udid}: ${err.message}`);

      _logger.default.debug('Carrying on anyway!');
    }
  }

  async shutdown() {
    await (0, _utils.killAllSimulators)();
  }

  async delete() {
    await simctl.deleteDevice(this.udid);
  }

  async updateSettings(plist, updates) {
    return await settings.updateSettings(this, plist, updates);
  }

  async updateLocationSettings(bundleId, authorized) {
    return await settings.updateLocationSettings(this, bundleId, authorized);
  }

  async setReduceMotion(reduceMotion = true) {
    if (await this.isFresh()) {
      await this.launchAndQuit(false, STARTUP_TIMEOUT);
    }

    await settings.setReduceMotion(this, reduceMotion);
  }

  async updateSafariSettings(updates) {
    let updated = await settings.updateSafariUserSettings(this, updates);
    return (await settings.updateSettings(this, 'mobileSafari', updates)) || updated;
  }

  async updateSafariGlobalSettings(updates) {
    return await settings.updateSafariGlobalSettings(this, updates);
  }

  async updateLocale(language, locale, calendarFormat) {
    return await settings.updateLocale(this, language, locale, calendarFormat);
  }

  async deleteSafari() {
    _logger.default.debug('Deleting Safari apps from simulator');

    let dirs = [];
    dirs.push((await this.getAppDir('com.apple.mobilesafari')));
    let pv = await this.getPlatformVersion();

    if (pv >= 8) {
      dirs.push((await this.getAppDir('com.apple.mobilesafari', 'Bundle')));
    }

    let deletePromises = [];

    for (let dir of _lodash.default.compact(dirs)) {
      _logger.default.debug(`Deleting directory: '${dir}'`);

      deletePromises.push(_appiumSupport.fs.rimraf(dir));
    }

    await _bluebird.default.all(deletePromises);
  }

  async cleanSafari(keepPrefs = true) {
    _logger.default.debug('Cleaning mobile safari data files');

    if (await this.isFresh()) {
      _logger.default.info('Could not find Safari support directories to clean out old ' + 'data. Probably there is nothing to clean out');

      return;
    }

    let libraryDir = _path.default.resolve(this.getDir(), 'Library');

    let safariRoot = await this.getAppDir('com.apple.mobilesafari');

    if (!safariRoot) {
      _logger.default.info('Could not find Safari support directories to clean out old ' + 'data. Probably there is nothing to clean out');

      return;
    }

    let safariLibraryDir = _path.default.resolve(safariRoot, 'Library');

    let filesToDelete = ['Caches/Snapshots/com.apple.mobilesafari', 'Caches/com.apple.mobilesafari/*', 'Caches/com.apple.WebAppCache/*', 'Caches/com.apple.WebKit.Networking/*', 'Caches/com.apple.WebKit.WebContent/*', 'Image Cache/*', 'WebKit/com.apple.mobilesafari/*', 'WebKit/GeolocationSites.plist', 'WebKit/LocalStorage/*.*', 'Safari/*', 'Cookies/*.binarycookies', 'Caches/com.apple.UIStatusBar/*', 'Caches/com.apple.keyboards/images/*', 'Caches/com.apple.Safari.SafeBrowsing/*', '../tmp/com.apple.mobilesafari/*'];
    let deletePromises = [];

    for (let file of filesToDelete) {
      deletePromises.push(_appiumSupport.fs.rimraf(_path.default.resolve(libraryDir, file)));
      deletePromises.push(_appiumSupport.fs.rimraf(_path.default.resolve(safariLibraryDir, file)));
    }

    if (!keepPrefs) {
      deletePromises.push(_appiumSupport.fs.rimraf(_path.default.resolve(safariLibraryDir, 'Preferences/*.plist')));
    }

    await _bluebird.default.all(deletePromises);
  }

  async removeApp(bundleId) {
    await simctl.removeApp(this.udid, bundleId);
  }

  async moveBuiltInApp(appName, appPath, newAppPath) {
    await (0, _utils.safeRimRaf)(newAppPath);
    await _appiumSupport.fs.copyFile(appPath, newAppPath);

    _logger.default.debug(`Copied '${appName}' to '${newAppPath}'`);

    await _appiumSupport.fs.rimraf(appPath);

    _logger.default.debug(`Temporarily deleted original app at '${appPath}'`);

    return [newAppPath, appPath];
  }

  async openUrl(url) {
    const SAFARI_BOOTED_INDICATOR = 'MobileSafari[';
    const SAFARI_STARTUP_TIMEOUT = 15 * 1000;
    const EXTRA_STARTUP_TIME = 3 * 1000;

    if (await this.isRunning()) {
      await (0, _asyncbox.retry)(5000, simctl.openUrl, this.udid, url);
      await this.tailLogsUntil(SAFARI_BOOTED_INDICATOR, SAFARI_STARTUP_TIMEOUT);

      _logger.default.debug(`Safari started, waiting ${EXTRA_STARTUP_TIME}ms for it to fully start`);

      await _bluebird.default.delay(EXTRA_STARTUP_TIME);

      _logger.default.debug('Done waiting for Safari');

      return;
    } else {
      throw new Error('Tried to open a url, but the Simulator is not Booted');
    }
  }

  async clearCaches(...folderNames) {
    const cachesRoot = _path.default.resolve(this.getDir(), 'Library', 'Caches');

    if (!(await _appiumSupport.fs.hasAccess(cachesRoot))) {
      _logger.default.debug(`Caches root at '${cachesRoot}' does not exist or is not accessible. Nothing to do there`);

      return 0;
    }

    let itemsToRemove = folderNames.length ? folderNames : await _appiumSupport.fs.readdir(cachesRoot);
    itemsToRemove = itemsToRemove.map(x => _path.default.resolve(cachesRoot, x));

    if (folderNames.length) {
      itemsToRemove = await _bluebird.default.filter(itemsToRemove, x => _appiumSupport.fs.hasAccess(x));
    }

    itemsToRemove = await _bluebird.default.filter(itemsToRemove, async x => (await _appiumSupport.fs.stat(x)).isDirectory());

    if (!itemsToRemove.length) {
      _logger.default.debug(`No Simulator cache items for cleanup were matched in '${cachesRoot}'`);

      return 0;
    }

    _logger.default.debug(`Matched ${itemsToRemove.length} Simulator cache ` + `item${itemsToRemove.length === 1 ? '' : 's'} for cleanup: ${itemsToRemove}`);

    try {
      await _bluebird.default.all(itemsToRemove, x => _appiumSupport.fs.rimraf(x));
    } catch (e) {
      _logger.default.warn(`Got an exception while cleaning Simulator caches: ${e.message}`);
    }

    return itemsToRemove.length;
  }

  async tailLogsUntil(bootedIndicator, timeoutMs) {
    let simLog = _path.default.resolve(this.getLogDir(), 'system.log');

    await (0, _asyncbox.retryInterval)(200, 200, async () => {
      let exists = await _appiumSupport.fs.exists(simLog);

      if (!exists) {
        throw new Error(`Could not find Simulator log: '${simLog}'`);
      }
    });

    _logger.default.info(`Simulator log at '${simLog}'`);

    _logger.default.info(`Tailing simulator logs until we encounter the string "${bootedIndicator}"`);

    _logger.default.info(`We will time out after ${timeoutMs}ms`);

    try {
      await (0, _tailUntil.tailUntil)(simLog, bootedIndicator, timeoutMs);
    } catch (err) {
      _logger.default.debug('Simulator startup timed out. Continuing anyway.');
    }
  }

  async enableCalendarAccess(bundleID) {
    await this.calendar.enableCalendarAccess(bundleID);
  }

  async disableCalendarAccess(bundleID) {
    await this.calendar.disableCalendarAccess(bundleID);
  }

  async hasCalendarAccess(bundleID) {
    return await this.calendar.hasCalendarAccess(bundleID);
  }

  async _activateWindow() {
    return `
      tell application "System Events"
        tell process "Simulator"
          set frontmost to false
          set frontmost to true
        end tell
      end tell
    `;
  }

  async executeUIClientScript(appleScript) {
    const windowActivationScript = await this._activateWindow();
    const resultScript = `${windowActivationScript ? windowActivationScript + '\n' : ''}${appleScript}`;

    _logger.default.debug(`Executing UI Apple Script on Simulator with UDID ${this.udid}: ${resultScript}`);

    return await UI_CLIENT_ACCESS_GUARD.acquire(this.simulatorApp, async () => {
      try {
        const {
          stdout
        } = await (0, _teen_process.exec)('osascript', ['-e', resultScript]);
        return stdout;
      } catch (err) {
        _logger.default.errorAndThrow(`Could not complete operation. Make sure Simulator UI is running and the parent Appium application (e. g. Appium.app or Terminal.app) ` + `is present in System Preferences > Security & Privacy > Privacy > Accessibility list. If the operation is still unsuccessful then ` + `it is not supported by this Simulator. ` + `Original error: ${err.message}`);
      }
    });
  }

  async isBiometricEnrolled() {
    const output = await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Touch ID Enrolled" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
        end tell
      end tell
    `);

    _logger.default.debug(`Touch ID enrolled state: ${output}`);

    return _lodash.default.isString(output) && output.trim() === 'true';
  }

  async enrollBiometric(isEnabled = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "Touch ID Enrolled" of menu 1 of menu bar item "Hardware" of menu bar 1
          set isChecked to (value of attribute "AXMenuItemMarkChar" of dstMenuItem) is "✓"
          if ${isEnabled ? 'not ' : ''}isChecked then
            click dstMenuItem
          end if
        end tell
      end tell
    `);
  }

  async sendBiometricMatch(shouldMatch = true) {
    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          set dstMenuItem to menu item "${shouldMatch ? 'Matching' : 'Non-matching'}" of menu 1 of menu item "Simulate Finger Touch" of menu 1 of menu bar item "Hardware" of menu bar 1
          click dstMenuItem
        end tell
      end tell
    `);
  }

  async dismissDatabaseAlert(increase = true) {
    let button = increase ? 'Increase' : 'Cancel';

    _logger.default.debug(`Attempting to dismiss database alert with '${button}' button`);

    await this.executeUIClientScript(`
      tell application "System Events"
        tell process "Simulator"
          click button "${button}" of window 1
        end tell
      end tell
    `);
  }

  async backupKeychains() {
    if (!(await _appiumSupport.fs.exists(this.keychainPath))) {
      return false;
    }

    const backupPath = await _appiumSupport.tempDir.path({
      prefix: `keychains_backup_${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`,
      suffix: '.zip'
    });
    const zipArgs = ['-r', backupPath, `${this.keychainPath}${_path.default.sep}`];

    _logger.default.debug(`Creating keychains backup with 'zip ${zipArgs.join(' ')}' command`);

    await (0, _teen_process.exec)('zip', zipArgs);

    if (_lodash.default.isString(this._keychainsBackupPath) && (await _appiumSupport.fs.exists(this._keychainsBackupPath))) {
      await _appiumSupport.fs.unlink(this._keychainsBackupPath);
    }

    this._keychainsBackupPath = backupPath;
    return true;
  }

  async restoreKeychains(excludePatterns = []) {
    if (!_lodash.default.isString(this._keychainsBackupPath) || !(await _appiumSupport.fs.exists(this._keychainsBackupPath))) {
      throw new Error(`The keychains backup archive does not exist. ` + `Are you sure it was created before?`);
    }

    if (_lodash.default.isString(excludePatterns)) {
      excludePatterns = excludePatterns.split(',').map(x => x.trim());
    }

    const {
      state
    } = await this.stat();
    const isServerRunning = state === 'Booted';
    let plistPath;

    if (isServerRunning) {
      plistPath = _path.default.resolve((await this.getLaunchDaemonsRoot()), 'com.apple.securityd.plist');

      if (!(await _appiumSupport.fs.exists(plistPath))) {
        throw new Error(`Cannot clear keychains because '${plistPath}' does not exist`);
      }

      await simctl.spawn(this.udid, ['launchctl', 'unload', plistPath]);
    }

    try {
      await _appiumSupport.fs.rimraf(this.keychainPath);
      await (0, _appiumSupport.mkdirp)(this.keychainPath);
      const unzipArgs = ['-o', this._keychainsBackupPath, ..._lodash.default.flatMap(excludePatterns.map(x => ['-x', x])), '-d', '/'];

      _logger.default.debug(`Restoring keychains with 'unzip ${unzipArgs.join(' ')}' command`);

      await (0, _teen_process.exec)('unzip', unzipArgs);
      await _appiumSupport.fs.unlink(this._keychainsBackupPath);
      this._keychainsBackupPath = null;
    } finally {
      if (isServerRunning && plistPath) {
        await simctl.spawn(this.udid, ['launchctl', 'load', plistPath]);
      }
    }

    return true;
  }

  async clearKeychains() {
    const plistPath = _path.default.resolve((await this.getLaunchDaemonsRoot()), 'com.apple.securityd.plist');

    if (!(await _appiumSupport.fs.exists(plistPath))) {
      throw new Error(`Cannot clear keychains because '${plistPath}' does not exist`);
    }

    await simctl.spawn(this.udid, ['launchctl', 'unload', plistPath]);

    try {
      if (await _appiumSupport.fs.exists(this.keychainPath)) {
        await _appiumSupport.fs.rimraf(this.keychainPath);
        await (0, _appiumSupport.mkdirp)(this.keychainPath);
      }
    } finally {
      await simctl.spawn(this.udid, ['launchctl', 'load', plistPath]);
    }
  }

  async setPermission(bundleId, permission, value) {
    await this.setPermissions(bundleId, {
      [permission]: value
    });
  }

  async setPermissions(bundleId, permissionsMapping) {
    await this.permissions.setAccess(bundleId, permissionsMapping);

    _logger.default.debug(`Set ${JSON.stringify(permissionsMapping)} access for '${bundleId}'`);
  }

  async getPermission(bundleId, serviceName) {
    const result = await this.permissions.getAccess(bundleId, serviceName);

    _logger.default.debug(`Got ${serviceName} access status for '${bundleId}': ${result}`);

    return result;
  }

  async getLaunchDaemonsRoot() {
    const devRoot = await (0, _utils.getDeveloperRoot)();
    return _path.default.resolve(devRoot, 'Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator.sdk/System/Library/LaunchDaemons');
  }

  static async _getDeviceStringPlatformVersion(platformVersion) {
    let reqVersion = platformVersion;

    if (!reqVersion) {
      reqVersion = await _appiumXcode.default.getMaxIOSSDK();

      _logger.default.warn(`No platform version set. Using max SDK version: ${reqVersion}`);

      if (!_lodash.default.isString(reqVersion)) {
        reqVersion = reqVersion % 1 ? String(reqVersion) : `${reqVersion}.0`;
      }
    }

    return reqVersion;
  }

  static async _getDeviceStringVersionString(platformVersion) {
    let reqVersion = await this._getDeviceStringPlatformVersion(platformVersion);
    return `(${reqVersion} Simulator)`;
  }

  static _getDeviceStringConfigFix() {
    return {
      'iPad Simulator (7.1 Simulator)': 'iPad 2 (7.1 Simulator)',
      'iPad Simulator (8.0 Simulator)': 'iPad 2 (8.0 Simulator)',
      'iPad Simulator (8.1 Simulator)': 'iPad 2 (8.1 Simulator)',
      'iPad Simulator (8.2 Simulator)': 'iPad 2 (8.2 Simulator)',
      'iPad Simulator (8.3 Simulator)': 'iPad 2 (8.3 Simulator)',
      'iPad Simulator (8.4 Simulator)': 'iPad 2 (8.4 Simulator)',
      'iPhone Simulator (7.1 Simulator)': 'iPhone 5s (7.1 Simulator)',
      'iPhone Simulator (8.4 Simulator)': 'iPhone 6 (8.4 Simulator)',
      'iPhone Simulator (8.3 Simulator)': 'iPhone 6 (8.3 Simulator)',
      'iPhone Simulator (8.2 Simulator)': 'iPhone 6 (8.2 Simulator)',
      'iPhone Simulator (8.1 Simulator)': 'iPhone 6 (8.1 Simulator)',
      'iPhone Simulator (8.0 Simulator)': 'iPhone 6 (8.0 Simulator)'
    };
  }

  static async getDeviceString(opts) {
    opts = Object.assign({}, {
      deviceName: null,
      platformVersion: null,
      forceIphone: false,
      forceIpad: false
    }, opts);
    let logOpts = {
      deviceName: opts.deviceName,
      platformVersion: opts.platformVersion,
      forceIphone: opts.forceIphone,
      forceIpad: opts.forceIpad
    };

    _logger.default.debug(`Getting device string from options: ${JSON.stringify(logOpts)}`);

    if ((opts.deviceName || '')[0] === '=') {
      return opts.deviceName.substring(1);
    }

    let isiPhone = !!opts.forceIphone || !opts.forceIpad;

    if (opts.deviceName) {
      let device = opts.deviceName.toLowerCase();

      if (device.indexOf('iphone') !== -1) {
        isiPhone = true;
      } else if (device.indexOf('ipad') !== -1) {
        isiPhone = false;
      }
    }

    let iosDeviceString = opts.deviceName || (isiPhone ? 'iPhone Simulator' : 'iPad Simulator');

    if (/^(iPhone|iPad)$/.test(iosDeviceString)) {
      iosDeviceString += ' Simulator';
    }

    if (/[^(iPhone|iPad)] Simulator/.test(iosDeviceString)) {
      iosDeviceString = iosDeviceString.replace(' Simulator', '');
    }

    iosDeviceString += ` ${await this._getDeviceStringVersionString(opts.platformVersion)}`;

    let CONFIG_FIX = this._getDeviceStringConfigFix();

    let configFix = CONFIG_FIX;

    if (configFix[iosDeviceString]) {
      iosDeviceString = configFix[iosDeviceString];

      _logger.default.debug(`Fixing device. Changed from '${opts.deviceName}' ` + `to '${iosDeviceString}'`);
    }

    _logger.default.debug(`Final device string is '${iosDeviceString}'`);

    return iosDeviceString;
  }

  async getWebInspectorSocket() {
    return null;
  }

}

exports.SimulatorXcode6 = SimulatorXcode6;

for (let [cmd, fn] of _lodash.default.toPairs(_index.default)) {
  SimulatorXcode6.prototype[cmd] = fn;
}

var _default = SimulatorXcode6;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9zaW11bGF0b3IteGNvZGUtNi5qcyJdLCJuYW1lcyI6WyJTVEFSVFVQX1RJTUVPVVQiLCJFWFRSQV9TVEFSVFVQX1RJTUUiLCJVSV9DTElFTlRfQUNDRVNTX0dVQVJEIiwiQXN5bmNMb2NrIiwiVUlfQ0xJRU5UX0JVTkRMRV9JRCIsIlNQUklOR0JPQVJEX0JVTkRMRV9JRCIsIkJPT1RfQ09NUExFVEVEX0VWRU5UIiwiU2ltdWxhdG9yWGNvZGU2IiwiRXZlbnRFbWl0dGVyIiwiY29uc3RydWN0b3IiLCJ1ZGlkIiwieGNvZGVWZXJzaW9uIiwiU3RyaW5nIiwiX3BsYXRmb3JtVmVyc2lvbiIsImtleWNoYWluUGF0aCIsInBhdGgiLCJyZXNvbHZlIiwiZ2V0RGlyIiwic2ltdWxhdG9yQXBwIiwiYXBwRGF0YUJ1bmRsZVBhdGhzIiwiaXNGcmVzaEZpbGVzIiwiZXh0cmFTdGFydHVwVGltZSIsImNhbGVuZGFyIiwiQ2FsZW5kYXIiLCJwZXJtaXNzaW9ucyIsIlBlcm1pc3Npb25zIiwidWlDbGllbnRCdW5kbGVJZCIsImdldFVJQ2xpZW50UGlkIiwic3Rkb3V0IiwiZSIsImlzTmFOIiwicGFyc2VJbnQiLCJ0cmltIiwibG9nIiwiZGVidWciLCJpc1VJQ2xpZW50UnVubmluZyIsIl8iLCJpc051bGwiLCJzdGFydHVwVGltZW91dCIsImdldFBsYXRmb3JtVmVyc2lvbiIsInNkayIsInN0YXQiLCJnZXRSb290RGlyIiwiaG9tZSIsInByb2Nlc3MiLCJlbnYiLCJIT01FIiwiZ2V0TG9nRGlyIiwiaW5zdGFsbEFwcCIsImFwcCIsInNpbWN0bCIsImlzQXBwSW5zdGFsbGVkIiwiYnVuZGxlSWQiLCJhcHBGaWxlIiwiYXBwRGlycyIsImdldEFwcERpcnMiLCJsZW5ndGgiLCJnZXRVc2VySW5zdGFsbGVkQnVuZGxlSWRzQnlCdW5kbGVOYW1lIiwiYnVuZGxlTmFtZSIsInJvb3RVc2VyQXBwRGlyIiwiYnVpbGRCdW5kbGVQYXRoTWFwIiwiYnVuZGxlSWRzIiwiaXNFbXB0eSIsInVzZXJBcHBEaXJQYXRoIiwiT2JqZWN0IiwiZW50cmllcyIsImZzIiwicmVhZGRpciIsImZpbmQiLCJmaWxlIiwiZXh0bmFtZSIsInRvTG93ZXJDYXNlIiwiaW5mb1BsaXN0UGF0aCIsImV4aXN0cyIsImluZm9QbGlzdCIsInBsaXN0IiwicGFyc2VQbGlzdEZpbGUiLCJDRkJ1bmRsZU5hbWUiLCJwdXNoIiwiZXJyIiwid2FybiIsIm1lc3NhZ2UiLCJnZXRBcHBEaXIiLCJpZCIsInN1YkRpciIsImlzRnJlc2giLCJhcHBsaWNhdGlvbkxpc3QiLCJwYXRoQnVuZGxlUGFpciIsImRpciIsImFwcEZpbGVzIiwiZ2xvYiIsIm1hdGNoIiwicmVhZEJ1bmRsZUlkIiwibWV0YWRhdGEiLCJzZXR0aW5ncyIsInJlYWQiLCJNQ01NZXRhZGF0YUlkZW50aWZpZXIiLCJidW5kbGVQYXRoRGlycyIsImJ1bmRsZVBhdGhQYWlycyIsInJlZHVjZSIsImJ1bmRsZU1hcCIsImJ1bmRsZVBhdGgiLCJkZXZpY2VBcnIiLCJ0b1BhaXJzIiwiZ2V0RGV2aWNlcyIsImRldmljZSIsImZpbGVzIiwicHYiLCJtYXAiLCJzIiwiZXhpc3RlbmNlcyIsImYiLCJoYXNBY2Nlc3MiLCJmcmVzaCIsImNvbXBhY3QiLCJpc1J1bm5pbmciLCJzdGF0ZSIsIndhaXRGb3JCb290IiwiYm9vdGVkSW5kaWNhdG9yIiwiZ2V0Qm9vdGVkSW5kaWNhdG9yU3RyaW5nIiwidGFpbExvZ3NVbnRpbCIsIkIiLCJkZWxheSIsImVtaXQiLCJpbmRpY2F0b3IiLCJwbGF0Zm9ybVZlcnNpb24iLCJzdGFydFVJQ2xpZW50Iiwib3B0cyIsImFzc2lnbiIsInNjYWxlRmFjdG9yIiwiY29ubmVjdEhhcmR3YXJlS2V5Ym9hcmQiLCJhcmdzIiwiZm9ybWF0dGVkRGV2aWNlTmFtZSIsIm5hbWUiLCJyZXBsYWNlIiwiYXJndW1lbnROYW1lIiwiaXNCb29sZWFuIiwiaW5mbyIsImpvaW4iLCJ0aW1lb3V0IiwiaW5jbHVkZXMiLCJzdGRlcnIiLCJydW4iLCJpc1NlcnZlclJ1bm5pbmciLCJzdGFydFRpbWUiLCJocnRpbWUiLCJzaHV0ZG93biIsImNsZWFuIiwiZW5kU2ltdWxhdG9yRGFlbW9uIiwiZXJhc2VEZXZpY2UiLCJzY3J1YkN1c3RvbUFwcCIsImFwcEJ1bmRsZUlkIiwiY2xlYW5DdXN0b21BcHAiLCJzY3J1YiIsImRlbGV0ZVByb21pc2VzIiwicmltcmFmIiwicmVsUm1QYXRoIiwicm1QYXRoIiwiYWxsIiwiZGlycyIsImRhdGEiLCJidW5kbGUiLCJ1bmRlZmluZWQiLCJzcmMiLCJsYXVuY2hBbmRRdWl0Iiwic2FmYXJpIiwib3BlblVybCIsIkVycm9yIiwibGF1bmNoY3RsQ21kIiwic3RvcENtZCIsInJlbW92ZUNtZCIsIndhaXRNcyIsImludGVydmFsTXMiLCJkZWxldGUiLCJkZWxldGVEZXZpY2UiLCJ1cGRhdGVTZXR0aW5ncyIsInVwZGF0ZXMiLCJ1cGRhdGVMb2NhdGlvblNldHRpbmdzIiwiYXV0aG9yaXplZCIsInNldFJlZHVjZU1vdGlvbiIsInJlZHVjZU1vdGlvbiIsInVwZGF0ZVNhZmFyaVNldHRpbmdzIiwidXBkYXRlZCIsInVwZGF0ZVNhZmFyaVVzZXJTZXR0aW5ncyIsInVwZGF0ZVNhZmFyaUdsb2JhbFNldHRpbmdzIiwidXBkYXRlTG9jYWxlIiwibGFuZ3VhZ2UiLCJsb2NhbGUiLCJjYWxlbmRhckZvcm1hdCIsImRlbGV0ZVNhZmFyaSIsImNsZWFuU2FmYXJpIiwia2VlcFByZWZzIiwibGlicmFyeURpciIsInNhZmFyaVJvb3QiLCJzYWZhcmlMaWJyYXJ5RGlyIiwiZmlsZXNUb0RlbGV0ZSIsInJlbW92ZUFwcCIsIm1vdmVCdWlsdEluQXBwIiwiYXBwTmFtZSIsImFwcFBhdGgiLCJuZXdBcHBQYXRoIiwiY29weUZpbGUiLCJ1cmwiLCJTQUZBUklfQk9PVEVEX0lORElDQVRPUiIsIlNBRkFSSV9TVEFSVFVQX1RJTUVPVVQiLCJjbGVhckNhY2hlcyIsImZvbGRlck5hbWVzIiwiY2FjaGVzUm9vdCIsIml0ZW1zVG9SZW1vdmUiLCJ4IiwiZmlsdGVyIiwiaXNEaXJlY3RvcnkiLCJ0aW1lb3V0TXMiLCJzaW1Mb2ciLCJlbmFibGVDYWxlbmRhckFjY2VzcyIsImJ1bmRsZUlEIiwiZGlzYWJsZUNhbGVuZGFyQWNjZXNzIiwiaGFzQ2FsZW5kYXJBY2Nlc3MiLCJfYWN0aXZhdGVXaW5kb3ciLCJleGVjdXRlVUlDbGllbnRTY3JpcHQiLCJhcHBsZVNjcmlwdCIsIndpbmRvd0FjdGl2YXRpb25TY3JpcHQiLCJyZXN1bHRTY3JpcHQiLCJhY3F1aXJlIiwiZXJyb3JBbmRUaHJvdyIsImlzQmlvbWV0cmljRW5yb2xsZWQiLCJvdXRwdXQiLCJpc1N0cmluZyIsImVucm9sbEJpb21ldHJpYyIsImlzRW5hYmxlZCIsInNlbmRCaW9tZXRyaWNNYXRjaCIsInNob3VsZE1hdGNoIiwiZGlzbWlzc0RhdGFiYXNlQWxlcnQiLCJpbmNyZWFzZSIsImJ1dHRvbiIsImJhY2t1cEtleWNoYWlucyIsImJhY2t1cFBhdGgiLCJ0ZW1wRGlyIiwicHJlZml4IiwiTWF0aCIsImZsb29yIiwicmFuZG9tIiwidG9TdHJpbmciLCJzdWJzdHJpbmciLCJzdWZmaXgiLCJ6aXBBcmdzIiwic2VwIiwiX2tleWNoYWluc0JhY2t1cFBhdGgiLCJ1bmxpbmsiLCJyZXN0b3JlS2V5Y2hhaW5zIiwiZXhjbHVkZVBhdHRlcm5zIiwic3BsaXQiLCJwbGlzdFBhdGgiLCJnZXRMYXVuY2hEYWVtb25zUm9vdCIsInNwYXduIiwidW56aXBBcmdzIiwiZmxhdE1hcCIsImNsZWFyS2V5Y2hhaW5zIiwic2V0UGVybWlzc2lvbiIsInBlcm1pc3Npb24iLCJ2YWx1ZSIsInNldFBlcm1pc3Npb25zIiwicGVybWlzc2lvbnNNYXBwaW5nIiwic2V0QWNjZXNzIiwiSlNPTiIsInN0cmluZ2lmeSIsImdldFBlcm1pc3Npb24iLCJzZXJ2aWNlTmFtZSIsInJlc3VsdCIsImdldEFjY2VzcyIsImRldlJvb3QiLCJfZ2V0RGV2aWNlU3RyaW5nUGxhdGZvcm1WZXJzaW9uIiwicmVxVmVyc2lvbiIsInhjb2RlIiwiZ2V0TWF4SU9TU0RLIiwiX2dldERldmljZVN0cmluZ1ZlcnNpb25TdHJpbmciLCJfZ2V0RGV2aWNlU3RyaW5nQ29uZmlnRml4IiwiZ2V0RGV2aWNlU3RyaW5nIiwiZGV2aWNlTmFtZSIsImZvcmNlSXBob25lIiwiZm9yY2VJcGFkIiwibG9nT3B0cyIsImlzaVBob25lIiwiaW5kZXhPZiIsImlvc0RldmljZVN0cmluZyIsInRlc3QiLCJDT05GSUdfRklYIiwiY29uZmlnRml4IiwiZ2V0V2ViSW5zcGVjdG9yU29ja2V0IiwiY21kIiwiZm4iLCJleHRlbnNpb25zIiwicHJvdG90eXBlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0EsTUFBTUEsZUFBZSxHQUFHLEtBQUssSUFBN0I7QUFDQSxNQUFNQyxrQkFBa0IsR0FBRyxJQUEzQjtBQUNBLE1BQU1DLHNCQUFzQixHQUFHLElBQUlDLGtCQUFKLEVBQS9CO0FBQ0EsTUFBTUMsbUJBQW1CLEdBQUcsMkJBQTVCO0FBQ0EsTUFBTUMscUJBQXFCLEdBQUcsdUJBQTlCOztBQVVBLE1BQU1DLG9CQUFvQixHQUFHLGVBQTdCOzs7QUFHQSxNQUFNQyxlQUFOLFNBQThCQyxvQkFBOUIsQ0FBMkM7QUFRekNDLEVBQUFBLFdBQVcsQ0FBRUMsSUFBRixFQUFRQyxZQUFSLEVBQXNCO0FBQy9CO0FBRUEsU0FBS0QsSUFBTCxHQUFZRSxNQUFNLENBQUNGLElBQUQsQ0FBbEI7QUFDQSxTQUFLQyxZQUFMLEdBQW9CQSxZQUFwQjtBQUtBLFNBQUtFLGdCQUFMLEdBQXdCLElBQXhCO0FBRUEsU0FBS0MsWUFBTCxHQUFvQkMsY0FBS0MsT0FBTCxDQUFhLEtBQUtDLE1BQUwsRUFBYixFQUE0QixTQUE1QixFQUF1QyxXQUF2QyxDQUFwQjtBQUNBLFNBQUtDLFlBQUwsR0FBb0IsbUJBQXBCO0FBRUEsU0FBS0Ms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QURqQztBQUVEOztBQUVEM1Asb0JBQUlDLEtBQUosQ0FBVywyQkFBMEIwUCxlQUFnQixHQUFyRDs7QUFDQSxXQUFPQSxlQUFQO0FBQ0Q7O0FBTUQsUUFBTUkscUJBQU4sR0FBK0I7QUFFN0IsV0FBTyxJQUFQO0FBQ0Q7O0FBNXhDd0M7Ozs7QUEreEMzQyxLQUFLLElBQUksQ0FBQ0MsR0FBRCxFQUFNQyxFQUFOLENBQVQsSUFBc0I5UCxnQkFBRW1FLE9BQUYsQ0FBVTRMLGNBQVYsQ0FBdEIsRUFBNkM7QUFDM0M1UixFQUFBQSxlQUFlLENBQUM2UixTQUFoQixDQUEwQkgsR0FBMUIsSUFBaUNDLEVBQWpDO0FBQ0Q7O2VBRWMzUixlIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBzaW1jdGwgZnJvbSAnbm9kZS1zaW1jdGwnO1xuaW1wb3J0IHsgZGVmYXVsdCBhcyB4Y29kZSwgZ2V0UGF0aCBhcyBnZXRYY29kZVBhdGggfSBmcm9tICdhcHBpdW0teGNvZGUnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBmcywgdGVtcERpciwgbWtkaXJwLCBwbGlzdCB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCBCIGZyb20gJ2JsdWViaXJkJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgQXN5bmNMb2NrIGZyb20gJ2FzeW5jLWxvY2snO1xuaW1wb3J0IHsga2lsbEFsbFNpbXVsYXRvcnMsIHNhZmVSaW1SYWYsIGdldERldmVsb3BlclJvb3QgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IGFzeW5jbWFwLCByZXRyeUludGVydmFsLCB3YWl0Rm9yQ29uZGl0aW9uLCByZXRyeSB9IGZyb20gJ2FzeW5jYm94JztcbmltcG9ydCAqIGFzIHNldHRpbmdzIGZyb20gJy4vc2V0dGluZ3MnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ3RlZW5fcHJvY2Vzcyc7XG5pbXBvcnQgeyB0YWlsVW50aWwgfSBmcm9tICcuL3RhaWwtdW50aWwuanMnO1xuaW1wb3J0IGV4dGVuc2lvbnMgZnJvbSAnLi9leHRlbnNpb25zL2luZGV4JztcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgQ2FsZW5kYXIgZnJvbSAnLi9jYWxlbmRhcic7XG5pbXBvcnQgUGVybWlzc2lvbnMgZnJvbSAnLi9wZXJtaXNzaW9ucyc7XG5cblxuY29uc3QgU1RBUlRVUF9USU1FT1VUID0gNjAgKiAxMDAwO1xuY29uc3QgRVhUUkFfU1RBUlRVUF9USU1FID0gMjAwMDtcbmNvbnN0IFVJX0NMSUVOVF9BQ0NFU1NfR1VBUkQgPSBuZXcgQXN5bmNMb2NrKCk7XG5jb25zdCBVSV9DTElFTlRfQlVORExFX0lEID0gJ2NvbS5hcHBsZS5pcGhvbmVzaW11bGF0b3InO1xuY29uc3QgU1BSSU5HQk9BUkRfQlVORExFX0lEID0gJ2NvbS5hcHBsZS5TcHJpbmdCb2FyZCc7XG5cbi8qXG4gKiBUaGlzIGV2ZW50IGlzIGVtaXR0ZWQgYXMgc29vbiBhcyBpT1MgU2ltdWxhdG9yXG4gKiBoYXMgZmluaXNoZWQgYm9vdGluZyBhbmQgaXQgaXMgcmVhZHkgdG8gYWNjZXB0IHhjcnVuIGNvbW1hbmRzLlxuICogVGhlIGV2ZW50IGhhbmRsZXIgaXMgY2FsbGVkIGFmdGVyICdydW4nIG1ldGhvZCBpcyBjb21wbGV0ZWRcbiAqIGZvciBYY29kZSA3IGFuZCBvbGRlciBhbmQgaXMgb25seSB1c2VmdWwgaW4gWGNvZGUgOCssXG4gKiBzaW5jZSBvbmUgY2FuIHN0YXJ0IGRvaW5nIHN0dWZmIChmb3IgZXhhbXBsZSBpbnN0YWxsL3VuaW5zdGFsbCBhbiBhcHApIGluIHBhcmFsbGVsXG4gKiB3aXRoIFNpbXVsYXRvciBVSSBzdGFydHVwLCB3aGljaCBzaG9ydGVucyBzZXNzaW9uIHN0YXJ0dXAgdGltZS5cbiAqL1xuY29uc3QgQk9PVF9DT01QTEVURURfRVZFTlQgPSAnYm9vdENvbXBsZXRlZCc7XG5cblxuY2xhc3MgU2ltdWxhdG9yWGNvZGU2IGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcblxuICAvKipcbiAgICogQ29uc3RydWN0cyB0aGUgb2JqZWN0IHdpdGggdGhlIGB1ZGlkYCBhbmQgdmVyc2lvbiBvZiBYY29kZS4gVXNlIHRoZSBleHBvcnRlZCBgZ2V0U2ltdWxhdG9yKHVkaWQpYCBtZXRob2QgaW5zdGVhZC5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IHVkaWQgLSBUaGUgU2ltdWxhdG9yIElELlxuICAgKiBAcGFyYW0ge29iamVjdH0geGNvZGVWZXJzaW9uIC0gVGhlIHRhcmdldCBYY29kZSB2ZXJzaW9uIGluIGZvcm1hdCB7bWFqb3IsIG1pbm9yLCBidWlsZH0uXG4gICAqL1xuICBjb25zdHJ1Y3RvciAodWRpZCwgeGNvZGVWZXJzaW9uKSB7XG4gICAgc3VwZXIoKTtcblxuICAgIHRoaXMudWRpZCA9IFN0cmluZyh1ZGlkKTtcbiAgICB0aGlzLnhjb2RlVmVyc2lvbiA9IHhjb2RlVmVyc2lvbjtcblxuICAgIC8vIHBsYXRmb3JtVmVyc2lvbiBjYW5ub3QgYmUgZm91bmQgaW5pdGlhbGx5LCBzaW5jZSBnZXR0aW5nIGl0IGhhcyBzaWRlIGVmZmVjdHMgZm9yXG4gICAgLy8gb3VyIGxvZ2ljIGZvciBmaWd1cmluZyBvdXQgaWYgYSBzaW0gaGFzIGJlZW4gcnVuXG4gICAgLy8gaXQgd2lsbCBiZSBzZXQgd2hlbiBpdCBpcyBuZWVkZWRcbiAgICB0aGlzLl9wbGF0Zm9ybVZlcnNpb24gPSBudWxsO1xuXG4gICAgdGhpcy5rZXljaGFpblBhdGggPSBwYXRoLnJlc29sdmUodGhpcy5nZXREaXIoKSwgJ0xpYnJhcnknLCAnS2V5Y2hhaW5zJyk7XG4gICAgdGhpcy5zaW11bGF0b3JBcHAgPSAnaU9TIFNpbXVsYXRvci5hcHAnO1xuXG4gICAgdGhpcy5hcHBEYXRhQnVuZGxlUGF0aHMgPSB7fTtcblxuICAgIC8vIGxpc3Qgb2YgZmlsZXMgdG8gY2hlY2sgZm9yIHdoZW4gc2VlaW5nIGlmIGEgc2ltdWxhdG9yIGlzIFwiZnJlc2hcIlxuICAgIC8vIChtZWFuaW5nIGl0IGhhcyBuZXZlciBiZWVuIGJvb3RlZCkuXG4gICAgLy8gSWYgdGhlc2UgZmlsZXMgYXJlIHByZXNlbnQsIHdlIGFzc3VtZSBpdCdzIGJlZW4gc3VjY2Vzc2Z1bGx5IGJvb3RlZFxuICAgIHRoaXMuaXNGcmVzaEZpbGVzID0gW1xuICAgICAgJ0xpYnJhcnkvQ29uZmlndXJhdGlvblByb2ZpbGVzJyxcbiAgICAgICdMaWJyYXJ5L0Nvb2tpZXMnLFxuICAgICAgJ0xpYnJhcnkvUHJlZmVyZW5jZXMvLkdsb2JhbFByZWZlcmVuY2VzLnBsaXN0JyxcbiAgICAgICdMaWJyYXJ5L1ByZWZlcmVuY2VzL2NvbS5hcHBsZS5zcHJpbmdib2FyZC5wbGlzdCcsXG4gICAgICAndmFyL3J1bi9zeXNsb2cucGlkJ1xuICAgIF07XG5cbiAgICAvLyBleHRyYSB0aW1lIHRvIHdhaXQgZm9yIHNpbXVsYXRvciB0byBiZSBkZWVtZWQgYm9vdGVkXG4gICAgdGhpcy5leHRyYVN0YXJ0dXBUaW1lID0gRVhUUkFfU1RBUlRVUF9USU1FO1xuXG4gICAgdGhpcy5jYWxlbmRhciA9IG5ldyBDYWxlbmRhcih4Y29kZVZlcnNpb24sIHRoaXMuZ2V0RGlyKCkpO1xuICAgIHRoaXMucGVybWlzc2lvbnMgPSBuZXcgUGVybWlzc2lvbnMoeGNvZGVWZXJzaW9uLCB0aGlzLmdldERpcigpLCB0aGlzLnVkaWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gQnVuZGxlIGlkZW50aWZpZXIgb2YgU2ltdWxhdG9yIFVJIGNsaWVudC5cbiAgICovXG4gIGdldCB1aUNsaWVudEJ1bmRsZUlkICgpIHtcbiAgICByZXR1cm4gVUlfQ0xJRU5UX0JVTkRMRV9JRDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZXMgdGhlIGN1cnJlbnQgcHJvY2VzcyBpZCBvZiB0aGUgVUkgY2xpZW50XG4gICAqXG4gICAqIEByZXR1cm4gez9zdHJpbmd9IFRoZSBwcm9jZXNzIElEIG9yIG51bGwgaWYgdGhlIFVJIGNsaWVudCBpcyBub3QgcnVubmluZ1xuICAgKi9cbiAgYXN5bmMgZ2V0VUlDbGllbnRQaWQgKCkge1xuICAgIGxldCBzdGRvdXQ7XG4gICAgdHJ5IHtcbiAgICAgICh7c3Rkb3V0fSA9IGF3YWl0IGV4ZWMoJ3BncmVwJywgWyctZm4nLCBgJHt0aGlzLnNpbXVsYXRvckFwcH0vQ29udGVudHMvTWFjT1MvYF0pKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKGlzTmFOKHBhcnNlSW50KHN0ZG91dCwgMTApKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHN0ZG91dCA9IHN0ZG91dC50cmltKCk7XG4gICAgbG9nLmRlYnVnKGBHb3QgU2ltdWxhdG9yIFVJIGNsaWVudCBQSUQ6ICR7c3Rkb3V0fWApO1xuICAgIHJldHVybiBzdGRvdXQ7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgdGhlIHN0YXRlIG9mIFNpbXVsYXRvciBVSSBjbGllbnQuXG4gICAqXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgb2YgaWYgVUkgY2xpZW50IGlzIHJ1bm5pbmcgb3IgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgYXN5bmMgaXNVSUNsaWVudFJ1bm5pbmcgKCkge1xuICAgIHJldHVybiAhXy5pc051bGwoYXdhaXQgdGhpcy5nZXRVSUNsaWVudFBpZCgpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIb3cgbG9uZyB0byB3YWl0IGJlZm9yZSB0aHJvd2luZyBhbiBlcnJvciBhYm91dCBTaW11bGF0b3Igc3RhcnR1cCB0aW1lb3V0IGhhcHBlbmVkLlxuICAgKlxuICAgKiBAcmV0dXJuIHtudW1iZXJ9IFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzLlxuICAgKi9cbiAgZ2V0IHN0YXJ0dXBUaW1lb3V0ICgpIHtcbiAgICByZXR1cm4gU1RBUlRVUF9USU1FT1VUO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgcGxhdGZvcm0gdmVyc2lvbiBvZiB0aGUgY3VycmVudCBTaW11bGF0b3IuXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gU0RLIHZlcnNpb24sIGZvciBleGFtcGxlICc4LjMnLlxuICAgKi9cbiAgYXN5bmMgZ2V0UGxhdGZvcm1WZXJzaW9uICgpIHtcbiAgICBpZiAoIXRoaXMuX3BsYXRmb3JtVmVyc2lvbikge1xuICAgICAgbGV0IHtzZGt9ID0gYXdhaXQgdGhpcy5zdGF0KCk7XG4gICAgICB0aGlzLl9wbGF0Zm9ybVZlcnNpb24gPSBzZGs7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9wbGF0Zm9ybVZlcnNpb247XG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmUgdGhlIGZ1bGwgcGF0aCB0byB0aGUgZGlyZWN0b3J5IHdoZXJlIFNpbXVsYXRvciBzdHVmZiBpcyBsb2NhdGVkLlxuICAgKlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBwYXRoIHN0cmluZy5cbiAgICovXG4gIGdldFJvb3REaXIgKCkge1xuICAgIGxldCBob21lID0gcHJvY2Vzcy5lbnYuSE9NRTtcbiAgICByZXR1cm4gcGF0aC5yZXNvbHZlKGhvbWUsICdMaWJyYXJ5JywgJ0RldmVsb3BlcicsICdDb3JlU2ltdWxhdG9yJywgJ0RldmljZXMnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZSB0aGUgZnVsbCBwYXRoIHRvIHRoZSBkaXJlY3Rvcnkgd2hlcmUgU2ltdWxhdG9yIGFwcGxpY2F0aW9ucyBkYXRhIGlzIGxvY2F0ZWQuXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIHBhdGggc3RyaW5nLlxuICAgKi9cbiAgZ2V0RGlyICgpIHtcbiAgICByZXR1cm4gcGF0aC5yZXNvbHZlKHRoaXMuZ2V0Um9vdERpcigpLCB0aGlzLnVkaWQsICdkYXRhJyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmUgdGhlIGZ1bGwgcGF0aCB0byB0aGUgZGlyZWN0b3J5IHdoZXJlIFNpbXVsYXRvciBsb2dzIGFyZSBzdG9yZWQuXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIHBhdGggc3RyaW5nLlxuICAgKi9cbiAgZ2V0TG9nRGlyICgpIHtcbiAgICBsZXQgaG9tZSA9IHByb2Nlc3MuZW52LkhPTUU7XG4gICAgcmV0dXJuIHBhdGgucmVzb2x2ZShob21lLCAnTGlicmFyeScsICdMb2dzJywgJ0NvcmVTaW11bGF0b3InLCB0aGlzLnVkaWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIEluc3RhbGwgdmFsaWQgLmFwcCBwYWNrYWdlIG9uIFNpbXVsYXRvci5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGFwcCAtIFRoZSBwYXRoIHRvIHRoZSAuYXBwIHBhY2thZ2UuXG4gICAqL1xuICBhc3luYyBpbnN0YWxsQXBwIChhcHApIHtcbiAgICByZXR1cm4gYXdhaXQgc2ltY3RsLmluc3RhbGxBcHAodGhpcy51ZGlkLCBhcHApO1xuICB9XG5cbiAgLyoqXG4gICAqIFZlcmlmeSB3aGV0aGVyIHRoZSBwYXJ0aWN1bGFyIGFwcGxpY2F0aW9uIGlzIGluc3RhbGxlZCBvbiBTaW11bGF0b3IuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBidW5kbGVJZCAtIFRoZSBidW5kbGUgaWQgb2YgdGhlIGFwcGxpY2F0aW9uIHRvIGJlIGNoZWNrZWQuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBhcHBGdWxlIC0gQXBwbGljYXRpb24gbmFtZSBtaW51cyBcIi5hcHBcIiAoZm9yIGlPUyA3LjEpXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIGdpdmVuIGFwcGxpY2F0aW9uIGlzIGluc3RhbGxlZFxuICAgKi9cbiAgYXN5bmMgaXNBcHBJbnN0YWxsZWQgKGJ1bmRsZUlkLCBhcHBGaWxlID0gbnVsbCkge1xuICAgIC8vIGBhcHBGaWxlYCBhcmd1bWVudCBvbmx5IG5lY2Vzc2FyeSBmb3IgaU9TIGJlbG93IHZlcnNpb24gOFxuICAgIGxldCBhcHBEaXJzID0gYXdhaXQgdGhpcy5nZXRBcHBEaXJzKGFwcEZpbGUsIGJ1bmRsZUlkKTtcbiAgICByZXR1cm4gYXBwRGlycy5sZW5ndGggIT09IDA7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB1c2VyIGluc3RhbGxlZCBidW5kbGUgaWRzIHdoaWNoIGhhcyAnYnVuZGxlTmFtZScgaW4gdGhlaXIgSW5mby5QbGlzdCBhcyAnQ0ZCdW5kbGVOYW1lJ1xuICAgKiBAcGFyYW0ge3N0cmluZ30gYnVuZGxlSWQgLSBUaGUgYnVuZGxlIGlkIG9mIHRoZSBhcHBsaWNhdGlvbiB0byBiZSBjaGVja2VkLlxuICAgKiBAcmV0dXJuIHthcnJheTxzdHJpbmc+fSAtIFRoZSBsaXN0IG9mIGJ1bmRsZSBpZHMgd2hpY2ggaGF2ZSAnYnVuZGxlTmFtZSdcbiAgICovXG4gIGFzeW5jIGdldFVzZXJJbnN0YWxsZWRCdW5kbGVJZHNCeUJ1bmRsZU5hbWUgKGJ1bmRsZU5hbWUpIHtcbiAgICBjb25zdCByb290VXNlckFwcERpciA9IGF3YWl0IHRoaXMuYnVpbGRCdW5kbGVQYXRoTWFwKCdCdW5kbGUnKTtcbiAgICBjb25zdCBidW5kbGVJZHMgPSBbXTtcbiAgICBpZiAoXy5pc0VtcHR5KHJvb3RVc2VyQXBwRGlyKSkge1xuICAgICAgcmV0dXJuIGJ1bmRsZUlkcztcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtidW5kbGVJZCwgdXNlckFwcERpclBhdGhdIG9mIE9iamVjdC5lbnRyaWVzKHJvb3RVc2VyQXBwRGlyKSkge1xuICAgICAgY29uc3QgYXBwRmlsZSA9IChhd2FpdCBmcy5yZWFkZGlyKHVzZXJBcHBEaXJQYXRoKSkuZmluZChcbiAgICAgICAgKGZpbGUpID0+IHBhdGguZXh0bmFtZShmaWxlKS50b0xvd2VyQ2FzZSgpID09PSAnLmFwcCcpO1xuICAgICAgY29uc3QgaW5mb1BsaXN0UGF0aCA9IHBhdGgucmVzb2x2ZSh1c2VyQXBwRGlyUGF0aCwgYXBwRmlsZSwgJ0luZm8ucGxpc3QnKTtcbiAgICAgIGlmICghYXdhaXQgZnMuZXhpc3RzKGluZm9QbGlzdFBhdGgpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW5mb1BsaXN0ID0gYXdhaXQgcGxpc3QucGFyc2VQbGlzdEZpbGUoaW5mb1BsaXN0UGF0aCwgZmFsc2UpO1xuICAgICAgICBpZiAoaW5mb1BsaXN0LkNGQnVuZGxlTmFtZSA9PT0gYnVuZGxlTmFtZSkge1xuICAgICAgICAgIGJ1bmRsZUlkcy5wdXNoKGJ1bmRsZUlkKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZy53YXJuKGBGYWlsZWQgdG8gcmVhZCBwbGlzdCAke2luZm9QbGlzdFBhdGh9LiBPcmlnaW5hbCBlcnJvciAnJHtlcnIubWVzc2FnZX0nYCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBsb2cuZGVidWcoYFRoZSBzaW11bGF0b3IgaGFzICcke2J1bmRsZUlkc30nIHdoaWNoIGhhdmUgJyR7YnVuZGxlTmFtZX0nIGFzIHRoZWlyICdDRkJ1bmRsZU5hbWUnYCk7XG4gICAgcmV0dXJuIGJ1bmRsZUlkcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXRyaWV2ZSB0aGUgZGlyZWN0b3J5IGZvciBhIHBhcnRpY3VsYXIgYXBwbGljYXRpb24ncyBkYXRhLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBFaXRoZXIgYSBidW5kbGVJZCAoZS5nLiwgY29tLmFwcGxlLm1vYmlsZXNhZmFyaSkgb3IsIGZvciBpT1MgNy4xLCB0aGUgYXBwIG5hbWUgd2l0aG91dCBgLmFwcGAgKGUuZy4sIE1vYmlsZVNhZmFyaSlcbiAgICogQHBhcmFtIHtzdHJpbmd9IHN1YmRpciAtIFRoZSBzdWItZGlyZWN0b3J5IHdlIGV4cGVjdCB0byBiZSB3aXRoaW4gdGhlIGFwcGxpY2F0aW9uIGRpcmVjdG9yeS4gRGVmYXVsdHMgdG8gXCJEYXRhXCIuXG4gICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIHJvb3QgYXBwbGljYXRpb24gZm9sZGVyLlxuICAgKi9cbiAgYXN5bmMgZ2V0QXBwRGlyIChpZCwgc3ViRGlyID0gJ0RhdGEnKSB7XG4gICAgdGhpcy5hcHBEYXRhQnVuZGxlUGF0aHNbc3ViRGlyXSA9IHRoaXMuYXBwRGF0YUJ1bmRsZVBhdGhzW3N1YkRpcl0gfHwge307XG4gICAgaWYgKF8uaXNFbXB0eSh0aGlzLmFwcERhdGFCdW5kbGVQYXRoc1tzdWJEaXJdKSAmJiAhYXdhaXQgdGhpcy5pc0ZyZXNoKCkpIHtcbiAgICAgIHRoaXMuYXBwRGF0YUJ1bmRsZVBhdGhzW3N1YkRpcl0gPSBhd2FpdCB0aGlzLmJ1aWxkQnVuZGxlUGF0aE1hcChzdWJEaXIpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hcHBEYXRhQnVuZGxlUGF0aHNbc3ViRGlyXVtpZF07XG4gIH1cblxuICAvKipcbiAgICogVGhlIHhjb2RlIDYgc2ltdWxhdG9ycyBhcmUgcmVhbGx5IGFubm95aW5nLCBhbmQgYnVyeSB0aGUgbWFpbiBhcHBcbiAgICogZGlyZWN0b3JpZXMgaW5zaWRlIGRpcmVjdG9yaWVzIGp1c3QgbmFtZWQgd2l0aCBIYXNoZXMuXG4gICAqIFRoaXMgZnVuY3Rpb24gZmluZHMgdGhlIHByb3BlciBkaXJlY3RvcnkgYnkgdHJhdmVyc2luZyBhbGwgb2YgdGhlbVxuICAgKiBhbmQgcmVhZGluZyBhIG1ldGFkYXRhIHBsaXN0IChNb2JpbGUgQ29udGFpbmVyIE1hbmFnZXIpIHRvIGdldCB0aGVcbiAgICogYnVuZGxlIGlkLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gc3ViZGlyIC0gVGhlIHN1Yi1kaXJlY3Rvcnkgd2UgZXhwZWN0IHRvIGJlIHdpdGhpbiB0aGUgYXBwbGljYXRpb24gZGlyZWN0b3J5LiBEZWZhdWx0cyB0byBcIkRhdGFcIi5cbiAgICogQHJldHVybiB7b2JqZWN0fSBUaGUgbGlzdCBvZiBwYXRoLWJ1bmRsZSBwYWlycyB0byBhbiBvYmplY3Qgd2hlcmUgYnVuZGxlSWRzIGFyZSBtYXBwZWQgdG8gcGF0aHMuXG4gICAqL1xuICBhc3luYyBidWlsZEJ1bmRsZVBhdGhNYXAgKHN1YkRpciA9ICdEYXRhJykge1xuICAgIGxvZy5kZWJ1ZygnQnVpbGRpbmcgYnVuZGxlIHBhdGggbWFwJyk7XG4gICAgbGV0IGFwcGxpY2F0aW9uTGlzdDtcbiAgICBsZXQgcGF0aEJ1bmRsZVBhaXI7XG4gICAgaWYgKGF3YWl0IHRoaXMuZ2V0UGxhdGZvcm1WZXJzaW9uKCkgPT09ICc3LjEnKSB7XG4gICAgICAvLyBhcHBzIGF2YWlsYWJsZVxuICAgICAgLy8gICBXZWIuYXBwLFxuICAgICAgLy8gICBXZWJWaWV3U2VydmljZS5hcHAsXG4gICAgICAvLyAgIE1vYmlsZVNhZmFyaS5hcHAsXG4gICAgICAvLyAgIFdlYkNvbnRlbnRBbmFseXNpc1VJLmFwcCxcbiAgICAgIC8vICAgRERBY3Rpb25zU2VydmljZS5hcHAsXG4gICAgICAvLyAgIFN0b3JlS2l0VUlTZXJ2aWNlLmFwcFxuICAgICAgYXBwbGljYXRpb25MaXN0ID0gcGF0aC5yZXNvbHZlKHRoaXMuZ2V0RGlyKCksICdBcHBsaWNhdGlvbnMnKTtcbiAgICAgIHBhdGhCdW5kbGVQYWlyID0gYXN5bmMgKGRpcikgPT4ge1xuICAgICAgICBkaXIgPSBwYXRoLnJlc29sdmUoYXBwbGljYXRpb25MaXN0LCBkaXIpO1xuICAgICAgICBsZXQgYXBwRmlsZXMgPSBhd2FpdCBmcy5nbG9iKGAke2Rpcn0vKi5hcHBgKTtcbiAgICAgICAgbGV0IGJ1bmRsZUlkID0gYXBwRmlsZXNbMF0ubWF0Y2goLy4qXFwvKC4qKVxcLmFwcC8pWzFdO1xuICAgICAgICByZXR1cm4ge3BhdGg6IGRpciwgYnVuZGxlSWR9O1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXBwbGljYXRpb25MaXN0ID0gcGF0aC5yZXNvbHZlKHRoaXMuZ2V0RGlyKCksICdDb250YWluZXJzJywgc3ViRGlyLCAnQXBwbGljYXRpb24nKTtcbiAgICAgIC8vIGdpdmVuIGEgZGlyZWN0b3J5LCBmaW5kIHRoZSBwbGlzdCBmaWxlIGFuZCBwdWxsIHRoZSBidW5kbGUgaWQgZnJvbSBpdFxuICAgICAgbGV0IHJlYWRCdW5kbGVJZCA9IGFzeW5jIChkaXIpID0+IHtcbiAgICAgICAgbGV0IHBsaXN0ID0gcGF0aC5yZXNvbHZlKGRpciwgJy5jb20uYXBwbGUubW9iaWxlX2NvbnRhaW5lcl9tYW5hZ2VyLm1ldGFkYXRhLnBsaXN0Jyk7XG4gICAgICAgIGxldCBtZXRhZGF0YSA9IGF3YWl0IHNldHRpbmdzLnJlYWQocGxpc3QpO1xuICAgICAgICByZXR1cm4gbWV0YWRhdGEuTUNNTWV0YWRhdGFJZGVudGlmaWVyO1xuICAgICAgfTtcbiAgICAgIC8vIGdpdmVuIGEgZGlyZWN0b3J5LCByZXR1cm4gdGhlIHBhdGggYW5kIGJ1bmRsZSBpZCBhc3NvY2lhdGVkIHdpdGggaXRcbiAgICAgIHBhdGhCdW5kbGVQYWlyID0gYXN5bmMgKGRpcikgPT4ge1xuICAgICAgICBkaXIgPSBwYXRoLnJlc29sdmUoYXBwbGljYXRpb25MaXN0LCBkaXIpO1xuICAgICAgICBsZXQgYnVuZGxlSWQgPSBhd2FpdCByZWFkQnVuZGxlSWQoZGlyKTtcbiAgICAgICAgcmV0dXJuIHtwYXRoOiBkaXIsIGJ1bmRsZUlkfTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFhd2FpdCBmcy5leGlzdHMoYXBwbGljYXRpb25MaXN0KSkge1xuICAgICAgbG9nLndhcm4oYE5vIGRpcmVjdG9yeSBwYXRoICcke2FwcGxpY2F0aW9uTGlzdH0nYCk7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgbGV0IGJ1bmRsZVBhdGhEaXJzID0gYXdhaXQgZnMucmVhZGRpcihhcHBsaWNhdGlvbkxpc3QpO1xuICAgIGxldCBidW5kbGVQYXRoUGFpcnMgPSBhd2FpdCBhc3luY21hcChidW5kbGVQYXRoRGlycywgYXN5bmMgKGRpcikgPT4ge1xuICAgICAgcmV0dXJuIGF3YWl0IHBhdGhCdW5kbGVQYWlyKGRpcik7XG4gICAgfSwgZmFsc2UpO1xuXG4gICAgLy8gcmVkdWNlIHRoZSBsaXN0IG9mIHBhdGgtYnVuZGxlIHBhaXJzIHRvIGFuIG9iamVjdCB3aGVyZSBidW5kbGVJZHMgYXJlIG1hcHBlZCB0byBwYXRoc1xuICAgIHJldHVybiBidW5kbGVQYXRoUGFpcnMucmVkdWNlKChidW5kbGVNYXAsIGJ1bmRsZVBhdGgpID0+IHtcbiAgICAgIGJ1bmRsZU1hcFtidW5kbGVQYXRoLmJ1bmRsZUlkXSA9IGJ1bmRsZVBhdGgucGF0aDtcbiAgICAgIHJldHVybiBidW5kbGVNYXA7XG4gICAgfSwge30pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgc3RhdGUgYW5kIHNwZWNpZmljcyBvZiB0aGlzIHNpbS5cbiAgICpcbiAgICogQHJldHVybiB7b2JqZWN0fSBTaW11bGF0b3Igc3RhdHMgbWFwcGluZywgZm9yIGV4YW1wbGU6XG4gICAqIHsgbmFtZTogJ2lQaG9uZSA0cycsXG4gICAqICAgdWRpZDogJ0MwOUIzNEU1LTdEQ0ItNDQyRS1CNzlDLUFCNkJDMDM1NzQxNycsXG4gICAqICAgc3RhdGU6ICdTaHV0ZG93bicsXG4gICAqICAgc2RrOiAnOC4zJ1xuICAgKiB9XG4gICAqL1xuICBhc3luYyBzdGF0ICgpIHtcbiAgICBmb3IgKGxldCBbc2RrLCBkZXZpY2VBcnJdIG9mIF8udG9QYWlycyhhd2FpdCBzaW1jdGwuZ2V0RGV2aWNlcygpKSkge1xuICAgICAgZm9yIChsZXQgZGV2aWNlIG9mIGRldmljZUFycikge1xuICAgICAgICBpZiAoZGV2aWNlLnVkaWQgPT09IHRoaXMudWRpZCkge1xuICAgICAgICAgIGRldmljZS5zZGsgPSBzZGs7XG4gICAgICAgICAgcmV0dXJuIGRldmljZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIGEgYmVzdC1iZXQgaGV1cmlzdGljIGZvciB3aGV0aGVyIG9yIG5vdCBhIHNpbSBoYXMgYmVlbiBib290ZWRcbiAgICogYmVmb3JlLiBXZSB1c3VhbGx5IHdhbnQgdG8gc3RhcnQgYSBzaW11bGF0b3IgdG8gXCJ3YXJtXCIgaXQgdXAsIGhhdmVcbiAgICogWGNvZGUgcG9wdWxhdGUgaXQgd2l0aCBwbGlzdHMgZm9yIHVzIHRvIG1hbmlwdWxhdGUgYmVmb3JlIGEgcmVhbFxuICAgKiB0ZXN0IHJ1bi5cbiAgICpcbiAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgY3VycmVudCBTaW11bGF0b3IgaGFzIG5ldmVyIGJlZW4gc3RhcnRlZCBiZWZvcmVcbiAgICovXG4gIGFzeW5jIGlzRnJlc2ggKCkge1xuICAgIC8vIGlmIHRoZSBmb2xsb3dpbmcgZmlsZXMgZG9uJ3QgZXhpc3QsIGl0IGhhc24ndCBiZWVuIGJvb3RlZC5cbiAgICAvLyBUSElTIElTIE5PVCBBTiBFWEhBVVNUSVZFIExJU1RcbiAgICBsZXQgZmlsZXMgPSB0aGlzLmlzRnJlc2hGaWxlcztcblxuICAgIGxldCBwdiA9IGF3YWl0IHRoaXMuZ2V0UGxhdGZvcm1WZXJzaW9uKCk7XG4gICAgaWYgKHB2ICE9PSAnNy4xJykge1xuICAgICAgZmlsZXMucHVzaCgnTGlicmFyeS9QcmVmZXJlbmNlcy9jb20uYXBwbGUuUHJlZmVyZW5jZXMucGxpc3QnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmlsZXMucHVzaCgnQXBwbGljYXRpb25zJyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGlyID0gdGhpcy5nZXREaXIoKTtcbiAgICBmaWxlcyA9IGZpbGVzLm1hcCgocykgPT4gcGF0aC5yZXNvbHZlKGRpciwgcykpO1xuXG4gICAgY29uc3QgZXhpc3RlbmNlcyA9IGF3YWl0IGFzeW5jbWFwKGZpbGVzLCBhc3luYyAoZikgPT4gYXdhaXQgZnMuaGFzQWNjZXNzKGYpKTtcbiAgICBjb25zdCBmcmVzaCA9IF8uY29tcGFjdChleGlzdGVuY2VzKS5sZW5ndGggIT09IGZpbGVzLmxlbmd0aDtcbiAgICBsb2cuZGVidWcoYENoZWNraW5nIHdoZXRoZXIgc2ltdWxhdG9yIGhhcyBiZWVuIHJ1biBiZWZvcmU6ICR7ZnJlc2ggPyAnbm8nIDogJ3llcyd9YCk7XG5cbiAgICByZXR1cm4gZnJlc2g7XG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmVzIHRoZSBzdGF0ZSBvZiB0aGUgY3VycmVudCBTaW11bGF0b3IuIE9uZSBzaG91bGQgZGlzdGluZ3Vpc2ggdGhlXG4gICAqIHN0YXRlcyBvZiBTaW11bGF0b3IgVUkgYW5kIHRoZSBTaW11bGF0b3IgaXRzZWxmLlxuICAgKlxuICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBjdXJyZW50IFNpbXVsYXRvciBpcyBydW5uaW5nLlxuICAgKi9cbiAgYXN5bmMgaXNSdW5uaW5nICgpIHtcbiAgICBsZXQgc3RhdCA9IGF3YWl0IHRoaXMuc3RhdCgpO1xuICAgIHJldHVybiBzdGF0LnN0YXRlID09PSAnQm9vdGVkJztcbiAgfVxuXG4gIC8qKlxuICAgKiBWZXJpZnkgd2hldGhlciB0aGUgU2ltdWxhdG9yIGJvb3RpbmcgaXMgY29tcGxldGVkIGFuZC9vciB3YWl0IGZvciBpdFxuICAgKiB1bnRpbCB0aGUgdGltZW91dCBleHBpcmVzLlxuICAgKlxuICAgKiBAcGFyYW0ge251bWJlcn0gc3RhcnR1cFRpbWVvdXQgLSB0aGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IHVudGlsIGJvb3RpbmcgaXMgY29tcGxldGVkLlxuICAgKiBAZW1pdHMgQk9PVF9DT01QTEVURURfRVZFTlQgaWYgdGhlIGN1cnJlbnQgU2ltdWxhdG9yIGlzIHJlYWR5IHRvIGFjY2VwdCBzaW1jdGwgY29tbWFuZHMsIGxpa2UgJ2luc3RhbGwnLlxuICAgKi9cbiAgYXN5bmMgd2FpdEZvckJvb3QgKHN0YXJ0dXBUaW1lb3V0KSB7XG4gICAgLy8gd2FpdCBmb3IgdGhlIHNpbXVsYXRvciB0byBib290XG4gICAgLy8gd2FpdGluZyBmb3IgdGhlIHNpbXVsYXRvciBzdGF0dXMgdG8gYmUgJ2Jvb3RlZCcgaXNuJ3QgZ29vZCBlbm91Z2hcbiAgICAvLyBpdCBjbGFpbXMgdG8gYmUgYm9vdGVkIHdheSBiZWZvcmUgZmluaXNoaW5nIGxvYWRpbmdcbiAgICAvLyBsZXQncyB0YWlsIHRoZSBzaW11bGF0b3Igc3lzdGVtIGxvZyB1bnRpbCB3ZSBzZWUgYSBtYWdpYyBsaW5lICh0aGlzLmJvb3RlZEluZGljYXRvcilcbiAgICBsZXQgYm9vdGVkSW5kaWNhdG9yID0gYXdhaXQgdGhpcy5nZXRCb290ZWRJbmRpY2F0b3JTdHJpbmcoKTtcbiAgICBhd2FpdCB0aGlzLnRhaWxMb2dzVW50aWwoYm9vdGVkSW5kaWNhdG9yLCBzdGFydHVwVGltZW91dCk7XG5cbiAgICAvLyBzbyBzb3JyeSwgYnV0IHdlIHNob3VsZCB3YWl0IGFub3RoZXIgdHdvIHNlY29uZHMsIGp1c3QgdG8gbWFrZSBzdXJlIHdlJ3ZlIHJlYWxseSBzdGFydGVkXG4gICAgLy8gd2UgY2FuJ3QgbG9vayBmb3IgYW5vdGhlciBtYWdpYyBsb2cgbGluZSwgYmVjYXVzZSB0aGV5IHNlZW0gdG8gYmUgYXBwLWRlcGVuZGVudCAobm90IHN5c3RlbSBkZXBlbmRlbnQpXG4gICAgbG9nLmRlYnVnKGBXYWl0aW5nIGFuIGV4dHJhICR7dGhpcy5leHRyYVN0YXJ0dXBUaW1lfW1zIGZvciB0aGUgc2ltdWxhdG9yIHRvIHJlYWxseSBmaW5pc2ggYm9vdGluZ2ApO1xuICAgIGF3YWl0IEIuZGVsYXkodGhpcy5leHRyYVN0YXJ0dXBUaW1lKTtcbiAgICBsb2cuZGVidWcoJ0RvbmUgd2FpdGluZyBleHRyYSB0aW1lIGZvciBzaW11bGF0b3InKTtcblxuICAgIHRoaXMuZW1pdChCT09UX0NPTVBMRVRFRF9FVkVOVCk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIG1hZ2ljIHN0cmluZywgd2hpY2gsIGlmIHByZXNlbnQgaW4gbG9ncywgcmVmbGVjdHMgdGhlIGZhY3QgdGhhdCBzaW11bGF0b3IgYm9vdGluZyBoYXMgYmVlbiBjb21wbGV0ZWQuXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIG1hZ2ljIGxvZyBzdHJpbmcuXG4gICAqL1xuICBhc3luYyBnZXRCb290ZWRJbmRpY2F0b3JTdHJpbmcgKCkge1xuICAgIGxldCBpbmRpY2F0b3I7XG4gICAgbGV0IHBsYXRmb3JtVmVyc2lvbiA9IGF3YWl0IHRoaXMuZ2V0UGxhdGZvcm1WZXJzaW9uKCk7XG4gICAgc3dpdGNoIChwbGF0Zm9ybVZlcnNpb24pIHtcbiAgICAgIGNhc2UgJzcuMSc6XG4gICAgICBjYXNlICc4LjEnOlxuICAgICAgY2FzZSAnOC4yJzpcbiAgICAgIGNhc2UgJzguMyc6XG4gICAgICBjYXNlICc4LjQnOlxuICAgICAgICBpbmRpY2F0b3IgPSAncHJvZmlsZWQ6IFNlcnZpY2Ugc3RhcnRpbmcuLi4nO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJzkuMCc6XG4gICAgICBjYXNlICc5LjEnOlxuICAgICAgY2FzZSAnOS4yJzpcbiAgICAgIGNhc2UgJzkuMyc6XG4gICAgICAgIGluZGljYXRvciA9ICdTeXN0ZW0gYXBwIFwiY29tLmFwcGxlLnNwcmluZ2JvYXJkXCIgZmluaXNoZWQgc3RhcnR1cCc7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnMTAuMCc6XG4gICAgICAgIGluZGljYXRvciA9ICdTd2l0Y2hpbmcgdG8ga2V5Ym9hcmQnO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxvZy53YXJuKGBObyBib290IGluZGljYXRvciBjYXNlIGZvciBwbGF0Zm9ybSB2ZXJzaW9uICcke3BsYXRmb3JtVmVyc2lvbn0nYCk7XG4gICAgICAgIGluZGljYXRvciA9ICdubyBib290IGluZGljYXRvciBzdHJpbmcgYXZhaWxhYmxlJztcbiAgICB9XG4gICAgcmV0dXJuIGluZGljYXRvcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCB0aGUgU2ltdWxhdG9yIFVJIGNsaWVudCB3aXRoIHRoZSBnaXZlbiBhcmd1bWVudHNcbiAgICpcbiAgICogQHBhcmFtIHtvYmplY3R9IG9wdHMgLSBPbmUgb3IgbW9yZSBvZiBhdmFpbGFibGUgU2ltdWxhdG9yIFVJIGNsaWVudCBvcHRpb25zOlxuICAgKiAgIC0ge3N0cmluZ30gc2NhbGVGYWN0b3I6IGNhbiBiZSBvbmUgb2YgWycxLjAnLCAnMC43NScsICcwLjUnLCAnMC4zMycsICcwLjI1J10uXG4gICAqICAgRGVmaW5lcyB0aGUgd2luZG93IHNjYWxlIHZhbHVlIGZvciB0aGUgVUkgY2xpZW50IHdpbmRvdyBmb3IgdGhlIGN1cnJlbnQgU2ltdWxhdG9yLlxuICAgKiAgIEVxdWFscyB0byBudWxsIGJ5IGRlZmF1bHQsIHdoaWNoIGtlZXBzIHRoZSBjdXJyZW50IHNjYWxlIHVuY2hhbmdlZC5cbiAgICogICAtIHtib29sZWFufSBjb25uZWN0SGFyZHdhcmVLZXlib2FyZDogd2hldGhlciB0byBjb25uZWN0IHRoZSBoYXJkd2FyZSBrZXlib2FyZCB0byB0aGVcbiAgICogICBTaW11bGF0b3IgVUkgY2xpZW50LiBFcXVhbHMgdG8gZmFsc2UgYnkgZGVmYXVsdC5cbiAgICogICAtIHtudW1iZXJ9IHN0YXJ0dXBUaW1lb3V0OiBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgdW50aWwgU2ltdWxhdG9yIGJvb3RpbmdcbiAgICogICBwcm9jZXNzIGlzIGNvbXBsZXRlZC4gVGhlIGRlZmF1bHQgdGltZW91dCB3aWxsIGJlIHVzZWQgaWYgbm90IHNldCBleHBsaWNpdGx5LlxuICAgKi9cbiAgYXN5bmMgc3RhcnRVSUNsaWVudCAob3B0cyA9IHt9KSB7XG4gICAgb3B0cyA9IE9iamVjdC5hc3NpZ24oe1xuICAgICAgc2NhbGVGYWN0b3I6IG51bGwsXG4gICAgICBjb25uZWN0SGFyZHdhcmVLZXlib2FyZDogZmFsc2UsXG4gICAgICBzdGFydHVwVGltZW91dDogdGhpcy5zdGFydHVwVGltZW91dCxcbiAgICB9LCBvcHRzKTtcblxuICAgIGNvbnN0IHNpbXVsYXRvckFwcCA9IHBhdGgucmVzb2x2ZShhd2FpdCBnZXRYY29kZVBhdGgoKSwgJ0FwcGxpY2F0aW9ucycsIHRoaXMuc2ltdWxhdG9yQXBwKTtcbiAgICBjb25zdCBhcmdzID0gWyctRm4nLCBzaW11bGF0b3JBcHAsICctLWFyZ3MnLCAnLUN1cnJlbnREZXZpY2VVRElEJywgdGhpcy51ZGlkXTtcblxuICAgIGlmIChvcHRzLnNjYWxlRmFjdG9yKSB7XG4gICAgICBjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5zdGF0KCk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWREZXZpY2VOYW1lID0gc3RhdC5uYW1lLnJlcGxhY2UoL1xccysvZywgJy0nKTtcbiAgICAgIGNvbnN0IGFyZ3VtZW50TmFtZSA9IGAtU2ltdWxhdG9yV2luZG93TGFzdFNjYWxlLWNvbS5hcHBsZS5Db3JlU2ltdWxhdG9yLlNpbURldmljZVR5cGUuJHtmb3JtYXR0ZWREZXZpY2VOYW1lfWA7XG4gICAgICBhcmdzLnB1c2goYXJndW1lbnROYW1lLCBvcHRzLnNjYWxlRmFjdG9yKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc0Jvb2xlYW4ob3B0cy5jb25uZWN0SGFyZHdhcmVLZXlib2FyZCkpIHtcbiAgICAgIGFyZ3MucHVzaCgnLUNvbm5lY3RIYXJkd2FyZUtleWJvYXJkJywgb3B0cy5jb25uZWN0SGFyZHdhcmVLZXlib2FyZCA/ICcxJyA6ICcwJyk7XG4gICAgfVxuXG4gICAgbG9nLmluZm8oYFN0YXJ0aW5nIFNpbXVsYXRvciBVSSB3aXRoIGNvbW1hbmQ6IG9wZW4gJHthcmdzLmpvaW4oJyAnKX1gKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZXhlYygnb3BlbicsIGFyZ3MsIHt0aW1lb3V0OiBvcHRzLnN0YXJ0dXBUaW1lb3V0fSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoIShlcnIuc3Rkb3V0IHx8ICcnKS5pbmNsdWRlcygnLTEwODI1JykgJiYgIShlcnIuc3RkZXJyIHx8ICcnKS5pbmNsdWRlcygnLTEwODI1JykpIHtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgICAgbG9nLndhcm4oYEVycm9yIHdoaWxlIG9wZW5pbmcgVUk6ICR7ZXJyLnN0ZG91dCB8fCBlcnIuc3RkZXJyfS4gQ29udGludWluZ2ApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlcyBnaXZlbiBTaW11bGF0b3Igd2l0aCBvcHRpb25zLiBUaGUgU2ltdWxhdG9yIHdpbGwgbm90IGJlIHJlc3RhcnRlZCBpZlxuICAgKiBpdCBpcyBhbHJlYWR5IHJ1bm5pbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRzIC0gT25lIG9yIG1vcmUgb2YgYXZhaWxhYmxlIFNpbXVsYXRvciBvcHRpb25zLlxuICAgKiAgIFNlZSB7I3N0YXJ0VUlDbGllbnQob3B0cyl9IGRvY3VtZW50YXRpb24gZm9yIG1vcmUgZGV0YWlscyBvbiBvdGhlciBzdXBwb3J0ZWQga2V5cy5cbiAgICovXG4gIGFzeW5jIHJ1biAob3B0cyA9IHt9KSB7XG4gICAgb3B0cyA9IE9iamVjdC5hc3NpZ24oe1xuICAgICAgc3RhcnR1cFRpbWVvdXQ6IHRoaXMuc3RhcnR1cFRpbWVvdXQsXG4gICAgfSwgb3B0cyk7XG4gICAgY29uc3Qge3N0YXRlfSA9IGF3YWl0IHRoaXMuc3RhdCgpO1xuICAgIGNvbnN0IGlzU2VydmVyUnVubmluZyA9IHN0YXRlID09PSAnQm9vdGVkJztcbiAgICBjb25zdCBpc1VJQ2xpZW50UnVubmluZyA9IGF3YWl0IHRoaXMuaXNVSUNsaWVudFJ1bm5pbmcoKTtcbiAgICBpZiAoaXNTZXJ2ZXJSdW5uaW5nICYmIGlzVUlDbGllbnRSdW5uaW5nKSB7XG4gICAgICBsb2cuaW5mbyhgQm90aCBTaW11bGF0b3Igd2l0aCBVRElEICR7dGhpcy51ZGlkfSBhbmQgdGhlIFVJIGNsaWVudCBhcmUgY3VycmVudGx5IHJ1bm5pbmdgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gcHJvY2Vzcy5ocnRpbWUoKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zaHV0ZG93bigpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nLndhcm4oYEVycm9yIG9uIFNpbXVsYXRvciBzaHV0ZG93bjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5zdGFydFVJQ2xpZW50KG9wdHMpO1xuXG4gICAgYXdhaXQgdGhpcy53YWl0Rm9yQm9vdChvcHRzLnN0YXJ0dXBUaW1lb3V0KTtcbiAgICBsb2cuaW5mbyhgU2ltdWxhdG9yIHdpdGggVURJRCAke3RoaXMudWRpZH0gYm9vdGVkIGluICR7cHJvY2Vzcy5ocnRpbWUoc3RhcnRUaW1lKVswXX0gc2Vjb25kc2ApO1xuICB9XG5cbiAgLy8gVE9ETyBrZWVwIGtleWNoYWluc1xuICAvKipcbiAgICogUmVzZXQgdGhlIGN1cnJlbnQgU2ltdWxhdG9yIHRvIHRoZSBjbGVhbiBzdGF0ZS5cbiAgICovXG4gIGFzeW5jIGNsZWFuICgpIHtcbiAgICBhd2FpdCB0aGlzLmVuZFNpbXVsYXRvckRhZW1vbigpO1xuICAgIGxvZy5pbmZvKGBDbGVhbmluZyBzaW11bGF0b3IgJHt0aGlzLnVkaWR9YCk7XG4gICAgYXdhaXQgc2ltY3RsLmVyYXNlRGV2aWNlKHRoaXMudWRpZCwgMTAwMDApO1xuICB9XG5cbiAgLyoqXG4gICAqIFNjcnViIChkZWxldGUgdGhlIHByZWZlcmVuY2VzIGFuZCBjaGFuZ2VkIGZpbGVzKSB0aGUgcGFydGljdWxhciBhcHBsaWNhdGlvbiBvbiBTaW11bGF0b3IuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBhcHBGaWxlIC0gQXBwbGljYXRpb24gbmFtZSBtaW51cyBcIi5hcHBcIi5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGFwcEJ1bmRsZUlkIC0gQnVuZGxlIGlkZW50aWZpZXIgb2YgdGhlIGFwcGxpY2F0aW9uLlxuICAgKi9cbiAgYXN5bmMgc2NydWJDdXN0b21BcHAgKGFwcEZpbGUsIGFwcEJ1bmRsZUlkKSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuY2xlYW5DdXN0b21BcHAoYXBwRmlsZSwgYXBwQnVuZGxlSWQsIHRydWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFuL3NjcnViIHRoZSBwYXJ0aWN1bGFyIGFwcGxpY2F0aW9uIG9uIFNpbXVsYXRvci5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGFwcEZpbGUgLSBBcHBsaWNhdGlvbiBuYW1lIG1pbnVzIFwiLmFwcFwiLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gYXBwQnVuZGxlSWQgLSBCdW5kbGUgaWRlbnRpZmllciBvZiB0aGUgYXBwbGljYXRpb24uXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gc2NydWIgLSBJZiBgc2NydWJgIGlzIGZhbHNlLCB3ZSB3YW50IHRvIGNsZWFuIGJ5IGRlbGV0aW5nIHRoZSBhcHAgYW5kIGFsbFxuICAgKiAgIGZpbGVzIGFzc29jaWF0ZWQgd2l0aCBpdC4gSWYgYHNjcnViYCBpcyB0cnVlLCB3ZSBqdXN0IHdhbnQgdG8gZGVsZXRlIHRoZSBwcmVmZXJlbmNlcyBhbmRcbiAgICogICBjaGFuZ2VkIGZpbGVzLlxuICAgKi9cbiAgYXN5bmMgY2xlYW5DdXN0b21BcHAgKGFwcEZpbGUsIGFwcEJ1bmRsZUlkLCBzY3J1YiA9IGZhbHNlKSB7XG4gICAgbG9nLmRlYnVnKGBDbGVhbmluZyBhcHAgZGF0YSBmaWxlcyBmb3IgJyR7YXBwRmlsZX0nLCAnJHthcHBCdW5kbGVJZH0nYCk7XG4gICAgaWYgKCFzY3J1Yikge1xuICAgICAgbG9nLmRlYnVnKGBEZWxldGluZyBhcHAgYWx0b2dldGhlcmApO1xuICAgIH1cblxuICAgIC8vIGdldCB0aGUgZGlyZWN0b3JpZXMgdG8gYmUgZGVsZXRlZFxuICAgIGxldCBhcHBEaXJzID0gYXdhaXQgdGhpcy5nZXRBcHBEaXJzKGFwcEZpbGUsIGFwcEJ1bmRsZUlkLCBzY3J1Yik7XG5cbiAgICBpZiAoYXBwRGlycy5sZW5ndGggPT09IDApIHtcbiAgICAgIGxvZy5kZWJ1ZygnQ291bGQgbm90IGZpbmQgYXBwIGRpcmVjdG9yaWVzIHRvIGRlbGV0ZS4gSXQgaXMgcHJvYmFibHkgbm90IGluc3RhbGxlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBkZWxldGVQcm9taXNlcyA9IFtdO1xuXG4gICAgZm9yIChsZXQgZGlyIG9mIGFwcERpcnMpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgRGVsZXRpbmcgZGlyZWN0b3J5OiAnJHtkaXJ9J2ApO1xuICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChmcy5yaW1yYWYoZGlyKSk7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuZ2V0UGxhdGZvcm1WZXJzaW9uKCkgPj0gOCkge1xuICAgICAgbGV0IHJlbFJtUGF0aCA9IGBMaWJyYXJ5L1ByZWZlcmVuY2VzLyR7YXBwQnVuZGxlSWR9LnBsaXN0YDtcbiAgICAgIGxldCBybVBhdGggPSBwYXRoLnJlc29sdmUodGhpcy5nZXRSb290RGlyKCksIHJlbFJtUGF0aCk7XG4gICAgICBsb2cuZGVidWcoYERlbGV0aW5nIGZpbGU6ICcke3JtUGF0aH0nYCk7XG4gICAgICBkZWxldGVQcm9taXNlcy5wdXNoKGZzLnJpbXJhZihybVBhdGgpKTtcbiAgICB9XG5cbiAgICBhd2FpdCBCLmFsbChkZWxldGVQcm9taXNlcyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0cmlldmUgcGF0aHMgdG8gZGlycyB3aGVyZSBhcHBsaWNhdGlvbiBkYXRhIGlzIHN0b3JlZC4gaU9TIDgrIHN0b3JlcyBhcHAgZGF0YSBpbiB0d28gcGxhY2VzLFxuICAgKiBhbmQgaU9TIDcuMSBoYXMgb25seSBvbmUgZGlyZWN0b3J5XG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBhcHBGaWxlIC0gQXBwbGljYXRpb24gbmFtZSBtaW51cyBcIi5hcHBcIi5cbiAgICogQHBhcmFtIHtzdHJpbmd9IGFwcEJ1bmRsZUlkIC0gQnVuZGxlIGlkZW50aWZpZXIgb2YgdGhlIGFwcGxpY2F0aW9uLlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IHNjcnViIC0gVGhlIGBCdW5kbGVgIGRpcmVjdG9yeSBoYXMgdGhlIGFjdHVhbCBhcHAgaW4gaXQuIElmIHdlIGFyZSBqdXN0IHNjcnViYmluZyxcbiAgICogICB3ZSB3YW50IHRoaXMgdG8gc3RheS4gSWYgd2UgYXJlIGNsZWFuaW5nIHdlIGRlbGV0ZS5cbiAgICogQHJldHVybiB7YXJyYXk8c3RyaW5nPn0gQXJyYXkgb2YgYXBwbGljYXRpb24gZGF0YSBwYXRocy5cbiAgICovXG4gIGFzeW5jIGdldEFwcERpcnMgKGFwcEZpbGUsIGFwcEJ1bmRsZUlkLCBzY3J1YiA9IGZhbHNlKSB7XG4gICAgbGV0IGRpcnMgPSBbXTtcbiAgICBpZiAoYXdhaXQgdGhpcy5nZXRQbGF0Zm9ybVZlcnNpb24oKSA+PSA4KSB7XG4gICAgICBsZXQgZGF0YSA9IGF3YWl0IHRoaXMuZ2V0QXBwRGlyKGFwcEJ1bmRsZUlkKTtcbiAgICAgIGlmICghZGF0YSkgcmV0dXJuIGRpcnM7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgY3VybHlcblxuICAgICAgbGV0IGJ1bmRsZSA9ICFzY3J1YiA/IGF3YWl0IHRoaXMuZ2V0QXBwRGlyKGFwcEJ1bmRsZUlkLCAnQnVuZGxlJykgOiB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAobGV0IHNyYyBvZiBbZGF0YSwgYnVuZGxlXSkge1xuICAgICAgICBpZiAoc3JjKSB7XG4gICAgICAgICAgZGlycy5wdXNoKHNyYyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmdldEFwcERpcihhcHBGaWxlKTtcbiAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGRpcnMucHVzaChkYXRhKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRpcnM7XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSB0aGUgU2ltdWxhdG9yIGluIG9yZGVyIHRvIGhhdmUgdGhlIGluaXRpYWwgZmlsZSBzdHJ1Y3R1cmUgY3JlYXRlZCBhbmQgc2h1dGRvd24gaXQgYWZ0ZXJ3YXJkcy5cbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBzYWZhcmkgLSBXaGV0aGVyIHRvIGV4ZWN1dGUgbW9iaWxlIFNhZmFyaSBhZnRlciBzdGFydHVwLlxuICAgKiBAcGFyYW0ge251bWJlcn0gc3RhcnR1cFRpbWVvdXQgLSBIb3cgbG9uZyB0byB3YWl0IHVudGlsIFNpbXVsYXRvciBib290aW5nIGlzIGNvbXBsZXRlZCAoaW4gbWlsbGlzZWNvbmRzKS5cbiAgICovXG4gIGFzeW5jIGxhdW5jaEFuZFF1aXQgKHNhZmFyaSA9IGZhbHNlLCBzdGFydHVwVGltZW91dCA9IHRoaXMuc3RhcnR1cFRpbWVvdXQpIHtcbiAgICBsb2cuZGVidWcoJ0F0dGVtcHRpbmcgdG8gbGF1bmNoIGFuZCBxdWl0IHRoZSBzaW11bGF0b3IsIHRvIGNyZWF0ZSBkaXJlY3Rvcnkgc3RydWN0dXJlJyk7XG4gICAgbG9nLmRlYnVnKGBXaWxsIGxhdW5jaCB3aXRoIFNhZmFyaT8gJHtzYWZhcml9YCk7XG5cbiAgICBhd2FpdCB0aGlzLnJ1bihzdGFydHVwVGltZW91dCk7XG5cbiAgICBpZiAoc2FmYXJpKSB7XG4gICAgICBhd2FpdCB0aGlzLm9wZW5VcmwoJ2h0dHA6Ly93d3cuYXBwaXVtLmlvJyk7XG4gICAgfVxuXG4gICAgLy8gd2FpdCBmb3IgdGhlIHN5c3RlbSB0byBjcmVhdGUgdGhlIGZpbGVzIHdlIHdpbGwgbWFuaXB1bGF0ZVxuICAgIC8vIG5lZWQgcXVpdGUgYSBoaWdoIHJldHJ5IG51bWJlciwgaW4gb3JkZXIgdG8gYWNjb21tb2RhdGUgaU9TIDcuMVxuICAgIC8vIGxvY2FsbHksIDcuMSBhdmVyYWdlcyA4LjUgcmV0cmllcyAoZnJvbSA2IC0gMTIpXG4gICAgLy8gICAgICAgICAgOCBhdmVyYWdlcyAwLjYgcmV0cmllcyAoZnJvbSAwIC0gMilcbiAgICAvLyAgICAgICAgICA5IGF2ZXJhZ2VzIDE0IHJldHJpZXNcbiAgICB0cnkge1xuICAgICAgYXdhaXQgcmV0cnlJbnRlcnZhbCg2MCwgMjUwLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmIChhd2FpdCB0aGlzLmlzRnJlc2goKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2ltdWxhdG9yIGZpbGVzIG5vdCBmdWxseSBjcmVhdGVkLiBXYWl0aW5nIGEgYml0Jyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nLndhcm4oYFRpbWVvdXQgd2FpdGluZyBmb3Igc2ltdWxhdG9yIGZpbGVzIHRvIGJlIGNyZWF0ZWQuIENvbnRpbnVpbmdgKTtcbiAgICB9XG5cbiAgICAvLyBhbmQgcXVpdFxuICAgIGF3YWl0IHRoaXMuc2h1dGRvd24oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb29rcyBmb3IgbGF1bmNoZCBkYWVtb25zIGNvcnJlc3BvbmRpbmcgdG8gdGhlIHNpbSB1ZGlkIGFuZCB0cmllcyB0byBzdG9wIHRoZW0gY2xlYW5seVxuICAgKiBUaGlzIHByZXZlbnRzIHhjcnVuIHNpbWN0bCBlcmFzZSBmcm9tIGhhbmdpbmcuXG4gICAqL1xuICBhc3luYyBlbmRTaW11bGF0b3JEYWVtb24gKCkge1xuICAgIGxvZy5kZWJ1ZyhgS2lsbGluZyBhbnkgc2ltdWxhdG9yIGRhZW1vbnMgZm9yICR7dGhpcy51ZGlkfWApO1xuXG4gICAgbGV0IGxhdW5jaGN0bENtZCA9IGBsYXVuY2hjdGwgbGlzdCB8IGdyZXAgJHt0aGlzLnVkaWR9IHwgY3V0IC1mIDMgfCB4YXJncyAtbiAxIGxhdW5jaGN0bGA7XG4gICAgdHJ5IHtcbiAgICAgIGxldCBzdG9wQ21kID0gYCR7bGF1bmNoY3RsQ21kfSBzdG9wYDtcbiAgICAgIGF3YWl0IGV4ZWMoJ2Jhc2gnLCBbJy1jJywgc3RvcENtZF0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nLndhcm4oYENvdWxkIG5vdCBzdG9wIHNpbXVsYXRvciBkYWVtb25zOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgbG9nLmRlYnVnKCdDYXJyeWluZyBvbiBhbnl3YXkhJyk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBsZXQgcmVtb3ZlQ21kID0gYCR7bGF1bmNoY3RsQ21kfSByZW1vdmVgO1xuICAgICAgYXdhaXQgZXhlYygnYmFzaCcsIFsnLWMnLCByZW1vdmVDbWRdKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy53YXJuKGBDb3VsZCBub3QgcmVtb3ZlIHNpbXVsYXRvciBkYWVtb25zOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgbG9nLmRlYnVnKCdDYXJyeWluZyBvbiBhbnl3YXkhJyk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAvLyBXYWl0cyAxMCBzZWMgZm9yIHRoZSBzaW11bGF0b3IgbGF1bmNoZCBzZXJ2aWNlcyB0byBzdG9wLlxuICAgICAgYXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiB7XG4gICAgICAgIGxldCB7c3Rkb3V0fSA9IGF3YWl0IGV4ZWMoJ2Jhc2gnLCBbJy1jJyxcbiAgICAgICAgICBgcHMgLWUgIHwgZ3JlcCAke3RoaXMudWRpZH0gfCBncmVwIGxhdW5jaGRfc2ltIHwgZ3JlcCAtdiBiYXNoIHwgZ3JlcCAtdiBncmVwIHwgYXdrIHsncHJpbnQkMSd9YF0pO1xuICAgICAgICByZXR1cm4gc3Rkb3V0LnRyaW0oKS5sZW5ndGggPT09IDA7XG4gICAgICB9LCB7d2FpdE1zOiAxMDAwMCwgaW50ZXJ2YWxNczogNTAwfSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2cud2FybihgQ291bGQgbm90IGVuZCBzaW11bGF0b3IgZGFlbW9uIGZvciAke3RoaXMudWRpZH06ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICBsb2cuZGVidWcoJ0NhcnJ5aW5nIG9uIGFueXdheSEnKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2h1dGRvd24gYWxsIHRoZSBydW5uaW5nIFNpbXVsYXRvcnMgYW5kIHRoZSBVSSBjbGllbnQuXG4gICAqL1xuICBhc3luYyBzaHV0ZG93biAoKSB7XG4gICAgYXdhaXQga2lsbEFsbFNpbXVsYXRvcnMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgdGhlIHBhcnRpY3VsYXIgU2ltdWxhdG9yIGZyb20gZGV2aWNlcyBsaXN0XG4gICAqL1xuICBhc3luYyBkZWxldGUgKCkge1xuICAgIGF3YWl0IHNpbWN0bC5kZWxldGVEZXZpY2UodGhpcy51ZGlkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIHBhcnRpY3VsYXIgcHJlZmVyZW5jZSBmaWxlIHdpdGggdGhlIGdpdmVuIGtleS92YWx1ZSBwYWlycy5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IHBsaXN0IC0gVGhlIHByZWZlcmVuY2VzIGZpbGUgdG8gdXBkYXRlLlxuICAgKiBAcGFyYW0ge29iamVjdH0gdXBkYXRlcyAtIFRoZSBrZXkvdmFsdWUgcGFpcnMgdG8gdXBkYXRlLlxuICAgKi9cbiAgYXN5bmMgdXBkYXRlU2V0dGluZ3MgKHBsaXN0LCB1cGRhdGVzKSB7XG4gICAgcmV0dXJuIGF3YWl0IHNldHRpbmdzLnVwZGF0ZVNldHRpbmdzKHRoaXMsIHBsaXN0LCB1cGRhdGVzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBdXRob3JpemUvZGUtYXV0aG9yaXplIGxvY2F0aW9uIHNldHRpbmdzIGZvciBhIHBhcnRpY3VsYXIgYXBwbGljYXRpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBidW5kbGVJZCAtIFRoZSBhcHBsaWNhdGlvbiBJRCB0byB1cGRhdGUuXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gYXV0aG9yaXplZCAtIFdoZXRoZXIgb3Igbm90IHRvIGF1dGhvcml6ZS5cbiAgICovXG4gIGFzeW5jIHVwZGF0ZUxvY2F0aW9uU2V0dGluZ3MgKGJ1bmRsZUlkLCBhdXRob3JpemVkKSB7XG4gICAgcmV0dXJuIGF3YWl0IHNldHRpbmdzLnVwZGF0ZUxvY2F0aW9uU2V0dGluZ3ModGhpcywgYnVuZGxlSWQsIGF1dGhvcml6ZWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIEVuYWJsZS9EaXNhYmxlIHJlZHVjZSBtb3Rpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gcmVkdWNlTW90aW9uIC0gV2hldGhlciBvciBub3QgdG8gZW5hYmxlIGl0LlxuICAgKi9cbiAgYXN5bmMgc2V0UmVkdWNlTW90aW9uIChyZWR1Y2VNb3Rpb24gPSB0cnVlKSB7XG4gICAgaWYgKGF3YWl0IHRoaXMuaXNGcmVzaCgpKSB7XG4gICAgICBhd2FpdCB0aGlzLmxhdW5jaEFuZFF1aXQoZmFsc2UsIFNUQVJUVVBfVElNRU9VVCk7XG4gICAgfVxuXG4gICAgYXdhaXQgc2V0dGluZ3Muc2V0UmVkdWNlTW90aW9uKHRoaXMsIHJlZHVjZU1vdGlvbik7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIHNldHRpbmdzIGZvciBTYWZhcmkuXG4gICAqXG4gICAqIEBwYXJhbSB7b2JqZWN0fSB1cGRhdGVzIC0gVGhlIGhhc2ggb2Yga2V5L3ZhbHVlIHBhaXJzIHRvIHVwZGF0ZSBmb3IgU2FmYXJpLlxuICAgKi9cbiAgYXN5bmMgdXBkYXRlU2FmYXJpU2V0dGluZ3MgKHVwZGF0ZXMpIHtcbiAgICBsZXQgdXBkYXRlZCA9IGF3YWl0IHNldHRpbmdzLnVwZGF0ZVNhZmFyaVVzZXJTZXR0aW5ncyh0aGlzLCB1cGRhdGVzKTtcbiAgICByZXR1cm4gYXdhaXQgc2V0dGluZ3MudXBkYXRlU2V0dGluZ3ModGhpcywgJ21vYmlsZVNhZmFyaScsIHVwZGF0ZXMpIHx8IHVwZGF0ZWQ7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGdsb2JhbCBzZXR0aW5ncyBmb3IgU2FmYXJpLlxuICAgKlxuICAgKiBAcGFyYW0ge29iamVjdH0gdXBkYXRlcyAtIFRoZSBoYXNoIG9mIGtleS92YWx1ZSBwYWlycyB0byB1cGRhdGUgZm9yIFNhZmFyaS5cbiAgICovXG4gIGFzeW5jIHVwZGF0ZVNhZmFyaUdsb2JhbFNldHRpbmdzICh1cGRhdGVzKSB7XG4gICAgcmV0dXJuIGF3YWl0IHNldHRpbmdzLnVwZGF0ZVNhZmFyaUdsb2JhbFNldHRpbmdzKHRoaXMsIHVwZGF0ZXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgbG9jYWxlIGZvciB0aGUgU2ltdWxhdG9yLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gbGFuZ3VhZ2UgLSBUaGUgbGFuZ3VhZ2UgZm9yIHRoZSBzaW11bGF0b3IuIEUuZy4sIGBcImZyX1VTXCJgLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gbG9jYWxlIC0gVGhlIGxvY2FsZSB0byBzZXQgZm9yIHRoZSBzaW11bGF0b3IuIEUuZy4sIGBcImVuXCJgLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gY2FsZW5kYXJGb3JtYXQgLSBUaGUgZm9ybWF0IG9mIHRoZSBjYWxlbmRhci5cbiAgICovXG4gIGFzeW5jIHVwZGF0ZUxvY2FsZSAobGFuZ3VhZ2UsIGxvY2FsZSwgY2FsZW5kYXJGb3JtYXQpIHtcbiAgICByZXR1cm4gYXdhaXQgc2V0dGluZ3MudXBkYXRlTG9jYWxlKHRoaXMsIGxhbmd1YWdlLCBsb2NhbGUsIGNhbGVuZGFyRm9ybWF0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wbGV0ZWx5IGRlbGV0ZSBtb2JpbGUgU2FmYXJpIGFwcGxpY2F0aW9uIGZyb20gdGhlIGN1cnJlbnQgU2ltdWxhdG9yLlxuICAgKi9cbiAgYXN5bmMgZGVsZXRlU2FmYXJpICgpIHtcbiAgICBsb2cuZGVidWcoJ0RlbGV0aW5nIFNhZmFyaSBhcHBzIGZyb20gc2ltdWxhdG9yJyk7XG5cbiAgICBsZXQgZGlycyA9IFtdO1xuXG4gICAgLy8gZ2V0IHRoZSBkYXRhIGRpcmVjdG9yeVxuICAgIGRpcnMucHVzaChhd2FpdCB0aGlzLmdldEFwcERpcignY29tLmFwcGxlLm1vYmlsZXNhZmFyaScpKTtcblxuICAgIGxldCBwdiA9IGF3YWl0IHRoaXMuZ2V0UGxhdGZvcm1WZXJzaW9uKCk7XG4gICAgaWYgKHB2ID49IDgpIHtcbiAgICAgIC8vIGdldCB0aGUgYnVuZGxlIGRpcmVjdG9yeVxuICAgICAgZGlycy5wdXNoKGF3YWl0IHRoaXMuZ2V0QXBwRGlyKCdjb20uYXBwbGUubW9iaWxlc2FmYXJpJywgJ0J1bmRsZScpKTtcbiAgICB9XG5cbiAgICBsZXQgZGVsZXRlUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGxldCBkaXIgb2YgXy5jb21wYWN0KGRpcnMpKSB7XG4gICAgICBsb2cuZGVidWcoYERlbGV0aW5nIGRpcmVjdG9yeTogJyR7ZGlyfSdgKTtcbiAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2goZnMucmltcmFmKGRpcikpO1xuICAgIH1cbiAgICBhd2FpdCBCLmFsbChkZWxldGVQcm9taXNlcyk7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYW4gdXAgdGhlIGRpcmVjdG9yaWVzIGZvciBtb2JpbGUgU2FmYXJpLlxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGtlZXBQcmVmcyAtIFdoZXRoZXIgdG8ga2VlcCBTYWZhcmkgcHJlZmVyZW5jZXMgZnJvbSBiZWluZyBkZWxldGVkLlxuICAgKi9cbiAgYXN5bmMgY2xlYW5TYWZhcmkgKGtlZXBQcmVmcyA9IHRydWUpIHtcbiAgICBsb2cuZGVidWcoJ0NsZWFuaW5nIG1vYmlsZSBzYWZhcmkgZGF0YSBmaWxlcycpO1xuICAgIGlmIChhd2FpdCB0aGlzLmlzRnJlc2goKSkge1xuICAgICAgbG9nLmluZm8oJ0NvdWxkIG5vdCBmaW5kIFNhZmFyaSBzdXBwb3J0IGRpcmVjdG9yaWVzIHRvIGNsZWFuIG91dCBvbGQgJyArXG4gICAgICAgICAgICAgICAnZGF0YS4gUHJvYmFibHkgdGhlcmUgaXMgbm90aGluZyB0byBjbGVhbiBvdXQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgbGlicmFyeURpciA9IHBhdGgucmVzb2x2ZSh0aGlzLmdldERpcigpLCAnTGlicmFyeScpO1xuICAgIGxldCBzYWZhcmlSb290ID0gYXdhaXQgdGhpcy5nZXRBcHBEaXIoJ2NvbS5hcHBsZS5tb2JpbGVzYWZhcmknKTtcbiAgICBpZiAoIXNhZmFyaVJvb3QpIHtcbiAgICAgIGxvZy5pbmZvKCdDb3VsZCBub3QgZmluZCBTYWZhcmkgc3VwcG9ydCBkaXJlY3RvcmllcyB0byBjbGVhbiBvdXQgb2xkICcgK1xuICAgICAgICAgICAgICAgJ2RhdGEuIFByb2JhYmx5IHRoZXJlIGlzIG5vdGhpbmcgdG8gY2xlYW4gb3V0Jyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCBzYWZhcmlMaWJyYXJ5RGlyID0gcGF0aC5yZXNvbHZlKHNhZmFyaVJvb3QsICdMaWJyYXJ5Jyk7XG4gICAgbGV0IGZpbGVzVG9EZWxldGUgPSBbXG4gICAgICAnQ2FjaGVzL1NuYXBzaG90cy9jb20uYXBwbGUubW9iaWxlc2FmYXJpJyxcbiAgICAgICdDYWNoZXMvY29tLmFwcGxlLm1vYmlsZXNhZmFyaS8qJyxcbiAgICAgICdDYWNoZXMvY29tLmFwcGxlLldlYkFwcENhY2hlLyonLFxuICAgICAgJ0NhY2hlcy9jb20uYXBwbGUuV2ViS2l0Lk5ldHdvcmtpbmcvKicsXG4gICAgICAnQ2FjaGVzL2NvbS5hcHBsZS5XZWJLaXQuV2ViQ29udGVudC8qJyxcbiAgICAgICdJbWFnZSBDYWNoZS8qJyxcbiAgICAgICdXZWJLaXQvY29tLmFwcGxlLm1vYmlsZXNhZmFyaS8qJyxcbiAgICAgICdXZWJLaXQvR2VvbG9jYXRpb25TaXRlcy5wbGlzdCcsXG4gICAgICAnV2ViS2l0L0xvY2FsU3RvcmFnZS8qLionLFxuICAgICAgJ1NhZmFyaS8qJyxcbiAgICAgICdDb29raWVzLyouYmluYXJ5Y29va2llcycsXG4gICAgICAnQ2FjaGVzL2NvbS5hcHBsZS5VSVN0YXR1c0Jhci8qJyxcbiAgICAgICdDYWNoZXMvY29tLmFwcGxlLmtleWJvYXJkcy9pbWFnZXMvKicsXG4gICAgICAnQ2FjaGVzL2NvbS5hcHBsZS5TYWZhcmkuU2FmZUJyb3dzaW5nLyonLFxuICAgICAgJy4uL3RtcC9jb20uYXBwbGUubW9iaWxlc2FmYXJpLyonXG4gICAgXTtcbiAgICBsZXQgZGVsZXRlUHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAobGV0IGZpbGUgb2YgZmlsZXNUb0RlbGV0ZSkge1xuICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChmcy5yaW1yYWYocGF0aC5yZXNvbHZlKGxpYnJhcnlEaXIsIGZpbGUpKSk7XG4gICAgICBkZWxldGVQcm9taXNlcy5wdXNoKGZzLnJpbXJhZihwYXRoLnJlc29sdmUoc2FmYXJpTGlicmFyeURpciwgZmlsZSkpKTtcbiAgICB9XG5cbiAgICBpZiAoIWtlZXBQcmVmcykge1xuICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChmcy5yaW1yYWYocGF0aC5yZXNvbHZlKHNhZmFyaUxpYnJhcnlEaXIsICdQcmVmZXJlbmNlcy8qLnBsaXN0JykpKTtcbiAgICB9XG5cbiAgICBhd2FpdCBCLmFsbChkZWxldGVQcm9taXNlcyk7XG4gIH1cblxuICAvKipcbiAgICogVW5pbnN0YWxsIHRoZSBnaXZlbiBhcHBsaWNhdGlvbiBmcm9tIHRoZSBjdXJyZW50IFNpbXVsYXRvci5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGJ1bmRsZUlkIC0gVGhlIGJ1aW5kbGUgSUQgb2YgdGhlIGFwcGxpY2F0aW9uIHRvIGJlIHJlbW92ZWQuXG4gICAqL1xuICBhc3luYyByZW1vdmVBcHAgKGJ1bmRsZUlkKSB7XG4gICAgYXdhaXQgc2ltY3RsLnJlbW92ZUFwcCh0aGlzLnVkaWQsIGJ1bmRsZUlkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3ZlIGEgYnVpbHQtaW4gYXBwbGljYXRpb24gdG8gYSBuZXcgcGxhY2UgKGFjdHVhbGx5LCByZW5hbWUgaXQpLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gYXBwTmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBhcHAgdG8gYmUgbW92ZWQuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBhcHBQYXRoIC0gVGhlIGN1cnJlbnQgcGF0aCB0byB0aGUgYXBwbGljYXRpb24uXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBuZXdBcHBQYXRoIC0gVGhlIG5ldyBwYXRoIHRvIHRoZSBhcHBsaWNhdGlvbi5cbiAgICogICBJZiBzb21lIGFwcGxpY2F0aW9uIGFscmVhZHkgZXhpc3RzIGJ5IHRoaXMgcGF0aCB0aGVuIGl0J3MgZ29pbmcgdG8gYmUgcmVtb3ZlZC5cbiAgICovXG4gIGFzeW5jIG1vdmVCdWlsdEluQXBwIChhcHBOYW1lLCBhcHBQYXRoLCBuZXdBcHBQYXRoKSB7XG4gICAgYXdhaXQgc2FmZVJpbVJhZihuZXdBcHBQYXRoKTtcbiAgICBhd2FpdCBmcy5jb3B5RmlsZShhcHBQYXRoLCBuZXdBcHBQYXRoKTtcbiAgICBsb2cuZGVidWcoYENvcGllZCAnJHthcHBOYW1lfScgdG8gJyR7bmV3QXBwUGF0aH0nYCk7XG5cbiAgICBhd2FpdCBmcy5yaW1yYWYoYXBwUGF0aCk7XG4gICAgbG9nLmRlYnVnKGBUZW1wb3JhcmlseSBkZWxldGVkIG9yaWdpbmFsIGFwcCBhdCAnJHthcHBQYXRofSdgKTtcblxuICAgIHJldHVybiBbbmV3QXBwUGF0aCwgYXBwUGF0aF07XG4gIH1cblxuICAvKipcbiAgICogT3BlbiB0aGUgZ2l2ZW4gVVJMIGluIG1vYmlsZSBTYWZhcmkgYnJvd3Nlci5cbiAgICogVGhlIGJyb3dzZXIgd2lsbCBiZSBzdGFydGVkIGF1dG9tYXRpY2FsbHkgaWYgaXQgaXMgbm90IHJ1bm5pbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgLSBUaGUgVVJMIHRvIGJlIG9wZW5lZC5cbiAgICovXG4gIGFzeW5jIG9wZW5VcmwgKHVybCkge1xuICAgIGNvbnN0IFNBRkFSSV9CT09URURfSU5ESUNBVE9SID0gJ01vYmlsZVNhZmFyaVsnO1xuICAgIGNvbnN0IFNBRkFSSV9TVEFSVFVQX1RJTUVPVVQgPSAxNSAqIDEwMDA7XG4gICAgY29uc3QgRVhUUkFfU1RBUlRVUF9USU1FID0gMyAqIDEwMDA7XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5pc1J1bm5pbmcoKSkge1xuICAgICAgYXdhaXQgcmV0cnkoNTAwMCwgc2ltY3RsLm9wZW5VcmwsIHRoaXMudWRpZCwgdXJsKTtcbiAgICAgIGF3YWl0IHRoaXMudGFpbExvZ3NVbnRpbChTQUZBUklfQk9PVEVEX0lORElDQVRPUiwgU0FGQVJJX1NUQVJUVVBfVElNRU9VVCk7XG4gICAgICAvLyBTbyBzb3JyeSwgYnV0IHRoZSBsb2dzIGhhdmUgbm90aGluZyBlbHNlIGZvciBTYWZhcmkgc3RhcnRpbmcuLiBqdXN0IGRlbGF5IGEgbGl0dGxlIGJpdFxuICAgICAgbG9nLmRlYnVnKGBTYWZhcmkgc3RhcnRlZCwgd2FpdGluZyAke0VYVFJBX1NUQVJUVVBfVElNRX1tcyBmb3IgaXQgdG8gZnVsbHkgc3RhcnRgKTtcbiAgICAgIGF3YWl0IEIuZGVsYXkoRVhUUkFfU1RBUlRVUF9USU1FKTtcbiAgICAgIGxvZy5kZWJ1ZygnRG9uZSB3YWl0aW5nIGZvciBTYWZhcmknKTtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUcmllZCB0byBvcGVuIGEgdXJsLCBidXQgdGhlIFNpbXVsYXRvciBpcyBub3QgQm9vdGVkJyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFBlcmZvcm0gU2ltdWxhdG9yIGNhY2hlcyBjbGVhbnVwLlxuICAgKlxuICAgKiBAcGFyYW0gey4uLnN0cmluZ30gZm9sZGVyTmFtZXMgLSBUaGUgbmFtZXMgb2YgQ2FjaGVzIHN1YmZvbGRlcnMgdG8gYmUgY2xlYW5lZC5cbiAgICogICBOb24tYWNjZXNzaWJsZS9ub24tZXhpc3Rpbmcgc3ViZm9sZGVycyB3aWxsIGJlIHNraXBwZWQuXG4gICAqICAgQWxsIGV4aXN0aW5nIHN1YmZvbGRlcnMgdW5kZXIgQ2FjaGVzIHdpbGwgYmUgZGVsZXRlZCBpZiB0aGlzIHBhcmFtZXRlciBpcyBvbWl0dGVkLlxuICAgKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgY291bnQgb2YgY2xlYW5lZCBjYWNoZSBpdGVtcy5cbiAgICogICBaZXJvIGlzIHJldHVybmVkIGlmIG5vIGl0ZW1zIHdlcmUgbWF0Y2hlZCBmb3IgY2xlYW51cCAoZWl0aGVyIG5vdCBhY2Nlc3NpYmxlIG9yIG5vdCBkaXJlY3RvcmllcykuXG4gICAqL1xuICBhc3luYyBjbGVhckNhY2hlcyAoLi4uZm9sZGVyTmFtZXMpIHtcbiAgICBjb25zdCBjYWNoZXNSb290ID0gcGF0aC5yZXNvbHZlKHRoaXMuZ2V0RGlyKCksICdMaWJyYXJ5JywgJ0NhY2hlcycpO1xuICAgIGlmICghKGF3YWl0IGZzLmhhc0FjY2VzcyhjYWNoZXNSb290KSkpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgQ2FjaGVzIHJvb3QgYXQgJyR7Y2FjaGVzUm9vdH0nIGRvZXMgbm90IGV4aXN0IG9yIGlzIG5vdCBhY2Nlc3NpYmxlLiBOb3RoaW5nIHRvIGRvIHRoZXJlYCk7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBsZXQgaXRlbXNUb1JlbW92ZSA9IGZvbGRlck5hbWVzLmxlbmd0aCA/IGZvbGRlck5hbWVzIDogKGF3YWl0IGZzLnJlYWRkaXIoY2FjaGVzUm9vdCkpO1xuICAgIGl0ZW1zVG9SZW1vdmUgPSBpdGVtc1RvUmVtb3ZlLm1hcCgoeCkgPT4gcGF0aC5yZXNvbHZlKGNhY2hlc1Jvb3QsIHgpKTtcbiAgICBpZiAoZm9sZGVyTmFtZXMubGVuZ3RoKSB7XG4gICAgICBpdGVtc1RvUmVtb3ZlID0gYXdhaXQgQi5maWx0ZXIoaXRlbXNUb1JlbW92ZSwgKHgpID0+IGZzLmhhc0FjY2Vzcyh4KSk7XG4gICAgfVxuICAgIGl0ZW1zVG9SZW1vdmUgPSBhd2FpdCBCLmZpbHRlcihpdGVtc1RvUmVtb3ZlLCBhc3luYyAoeCkgPT4gKGF3YWl0IGZzLnN0YXQoeCkpLmlzRGlyZWN0b3J5KCkpO1xuICAgIGlmICghaXRlbXNUb1JlbW92ZS5sZW5ndGgpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgTm8gU2ltdWxhdG9yIGNhY2hlIGl0ZW1zIGZvciBjbGVhbnVwIHdlcmUgbWF0Y2hlZCBpbiAnJHtjYWNoZXNSb290fSdgKTtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIGxvZy5kZWJ1ZyhgTWF0Y2hlZCAke2l0ZW1zVG9SZW1vdmUubGVuZ3RofSBTaW11bGF0b3IgY2FjaGUgYCArXG4gICAgICBgaXRlbSR7aXRlbXNUb1JlbW92ZS5sZW5ndGggPT09IDEgPyAnJyA6ICdzJ30gZm9yIGNsZWFudXA6ICR7aXRlbXNUb1JlbW92ZX1gKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgQi5hbGwoaXRlbXNUb1JlbW92ZSwgKHgpID0+IGZzLnJpbXJhZih4KSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nLndhcm4oYEdvdCBhbiBleGNlcHRpb24gd2hpbGUgY2xlYW5pbmcgU2ltdWxhdG9yIGNhY2hlczogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICAgIHJldHVybiBpdGVtc1RvUmVtb3ZlLmxlbmd0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBCbG9ja3MgdW50aWwgdGhlIGdpdmVuIGluZGljYXRlciBzdHJpbmcgYXBwZWFycyBpbiBTaW11bGF0b3IgbG9ncy5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGJvb3RlZEluZGljYXRvciAtIFRoZSBtYWdpYyBzdHJpbmcsIHdoaWNoIGFwcGVhcnMgaW4gbG9ncyBhZnRlciBTaW11bGF0b3IgYm9vdGluZyBpcyBjb21wbGV0ZWQuXG4gICAqIEBwYXJhbSB7bnVtYmVyfSB0aW1lb3V0TXMgLSBUaGUgbWF4aW11bW0gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciB0aGUgc3RyaW5nIGluZGljYXRvciBwcmVzZW5jZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9IEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIGlvcyBzaW11bGF0b3IgbG9ncyBvdXRwdXQgYSBsaW5lIG1hdGNoaW5nIGBib290ZWRJbmRpY2F0b3JgXG4gICAqIHRpbWVzIG91dCBhZnRlciB0aW1lb3V0TXNcbiAgICovXG4gIGFzeW5jIHRhaWxMb2dzVW50aWwgKGJvb3RlZEluZGljYXRvciwgdGltZW91dE1zKSB7XG4gICAgbGV0IHNpbUxvZyA9IHBhdGgucmVzb2x2ZSh0aGlzLmdldExvZ0RpcigpLCAnc3lzdGVtLmxvZycpO1xuXG4gICAgLy8gd2UgbmVlZCB0byBtYWtlIHN1cmUgbG9nIGZpbGUgZXhpc3RzIGJlZm9yZSB3ZSBjYW4gdGFpbCBpdFxuICAgIGF3YWl0IHJldHJ5SW50ZXJ2YWwoMjAwLCAyMDAsIGFzeW5jICgpID0+IHtcbiAgICAgIGxldCBleGlzdHMgPSBhd2FpdCBmcy5leGlzdHMoc2ltTG9nKTtcbiAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgU2ltdWxhdG9yIGxvZzogJyR7c2ltTG9nfSdgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGxvZy5pbmZvKGBTaW11bGF0b3IgbG9nIGF0ICcke3NpbUxvZ30nYCk7XG4gICAgbG9nLmluZm8oYFRhaWxpbmcgc2ltdWxhdG9yIGxvZ3MgdW50aWwgd2UgZW5jb3VudGVyIHRoZSBzdHJpbmcgXCIke2Jvb3RlZEluZGljYXRvcn1cImApO1xuICAgIGxvZy5pbmZvKGBXZSB3aWxsIHRpbWUgb3V0IGFmdGVyICR7dGltZW91dE1zfW1zYCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRhaWxVbnRpbChzaW1Mb2csIGJvb3RlZEluZGljYXRvciwgdGltZW91dE1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy5kZWJ1ZygnU2ltdWxhdG9yIHN0YXJ0dXAgdGltZWQgb3V0LiBDb250aW51aW5nIGFueXdheS4nKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRW5hYmxlIENhbGVuZGFyIGFjY2VzcyBmb3IgdGhlIGdpdmVuIGFwcGxpY2F0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gYnVuZGxlSUQgLSBCdW5kbGUgSUQgb2YgdGhlIGFwcGxpY2F0aW9uLCBmb3Igd2hpY2ggdGhlIGFjY2VzcyBzaG91bGQgYmUgZ3JhbnRlZC5cbiAgICovXG4gIGFzeW5jIGVuYWJsZUNhbGVuZGFyQWNjZXNzIChidW5kbGVJRCkge1xuICAgIGF3YWl0IHRoaXMuY2FsZW5kYXIuZW5hYmxlQ2FsZW5kYXJBY2Nlc3MoYnVuZGxlSUQpO1xuICB9XG5cbiAgLyoqXG4gICAqIERpc2FibGUgQ2FsZW5kYXIgYWNjZXNzIGZvciB0aGUgZ2l2ZW4gYXBwbGljYXRpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBidW5kbGVJRCAtIEJ1bmRsZSBJRCBvZiB0aGUgYXBwbGljYXRpb24sIGZvciB3aGljaCB0aGUgYWNjZXNzIHNob3VsZCBiZSBkZW5pZWQuXG4gICAqL1xuICBhc3luYyBkaXNhYmxlQ2FsZW5kYXJBY2Nlc3MgKGJ1bmRsZUlEKSB7XG4gICAgYXdhaXQgdGhpcy5jYWxlbmRhci5kaXNhYmxlQ2FsZW5kYXJBY2Nlc3MoYnVuZGxlSUQpO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIHdoZXRoZXIgdGhlIGdpdmVuIGFwcGxpY2F0aW9uIGhhcyBhY2Nlc3MgdG8gQ2FsZW5kYXIuXG4gICAqXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIGdpdmVuIGFwcGxpY2F0aW9uIGhhcyB0aGUgYWNjZXNzLlxuICAgKi9cbiAgYXN5bmMgaGFzQ2FsZW5kYXJBY2Nlc3MgKGJ1bmRsZUlEKSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuY2FsZW5kYXIuaGFzQ2FsZW5kYXJBY2Nlc3MoYnVuZGxlSUQpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFjdGl2YXRlcyBTaW11bGF0b3Igd2luZG93LlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAcmV0dXJucyB7P3N0cmluZ30gSWYgdGhlIG1ldGhvZCByZXR1cm5zIGEgc3RyaW5nIHRoZW4gaXQgc2hvdWxkIGJlIGEgdmFsaWQgQXBwbGUgU2NyaXB0IHdoaWNoXG4gICAqIGlzIGFwcGVuZGVkIGJlZm9yZSBlYWNoIFVJIGNsaWVudCBjb21tYW5kIGlzIGV4ZWN1dGVkLiBPdGhlcndpc2UgdGhlIG1ldGhvZCBzaG91bGQgYWN0aXZhdGUgdGhlIHdpbmRvd1xuICAgKiBpdHNlbGYgYW5kIHJldHVybiBub3RoaW5nLlxuICAgKi9cbiAgYXN5bmMgX2FjdGl2YXRlV2luZG93ICgpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZSByZXF1aXJlLWF3YWl0XG4gICAgcmV0dXJuIGBcbiAgICAgIHRlbGwgYXBwbGljYXRpb24gXCJTeXN0ZW0gRXZlbnRzXCJcbiAgICAgICAgdGVsbCBwcm9jZXNzIFwiU2ltdWxhdG9yXCJcbiAgICAgICAgICBzZXQgZnJvbnRtb3N0IHRvIGZhbHNlXG4gICAgICAgICAgc2V0IGZyb250bW9zdCB0byB0cnVlXG4gICAgICAgIGVuZCB0ZWxsXG4gICAgICBlbmQgdGVsbFxuICAgIGA7XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBnaXZlbiBBcHBsZSBTY3JpcHQgaW5zaWRlIGEgY3JpdGljYWwgc2VjdGlvbiwgc28gb3RoZXJcbiAgICogc2Vzc2lvbnMgY2Fubm90IGluZmx1ZW5jZSB0aGUgVUkgY2xpZW50IGF0IHRoZSBzYW1lIHRpbWUuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBhcHBsZVNjcmlwdCAtIFRoZSB2YWxpZCBBcHBsZSBTY3JpcHQgc25pcHBldCB0byBiZSBleGVjdXRlZC5cbiAgICogQHJldHVybiB7c3RyaW5nfSBUaGUgc3Rkb3V0IG91dHB1dCBwcm9kdWNlZCBieSB0aGUgc2NyaXB0LlxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgb3Nhc2NyaXB0IHRvb2wgcmV0dXJucyBub24temVybyBleGl0IGNvZGUuXG4gICAqL1xuICBhc3luYyBleGVjdXRlVUlDbGllbnRTY3JpcHQgKGFwcGxlU2NyaXB0KSB7XG4gICAgY29uc3Qgd2luZG93QWN0aXZhdGlvblNjcmlwdCA9IGF3YWl0IHRoaXMuX2FjdGl2YXRlV2luZG93KCk7XG4gICAgY29uc3QgcmVzdWx0U2NyaXB0ID0gYCR7d2luZG93QWN0aXZhdGlvblNjcmlwdCA/IHdpbmRvd0FjdGl2YXRpb25TY3JpcHQgKyAnXFxuJyA6ICcnfSR7YXBwbGVTY3JpcHR9YDtcbiAgICBsb2cuZGVidWcoYEV4ZWN1dGluZyBVSSBBcHBsZSBTY3JpcHQgb24gU2ltdWxhdG9yIHdpdGggVURJRCAke3RoaXMudWRpZH06ICR7cmVzdWx0U2NyaXB0fWApO1xuICAgIHJldHVybiBhd2FpdCBVSV9DTElFTlRfQUNDRVNTX0dVQVJELmFjcXVpcmUodGhpcy5zaW11bGF0b3JBcHAsIGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHtzdGRvdXR9ID0gYXdhaXQgZXhlYygnb3Nhc2NyaXB0JywgWyctZScsIHJlc3VsdFNjcmlwdF0pO1xuICAgICAgICByZXR1cm4gc3Rkb3V0O1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZy5lcnJvckFuZFRocm93KGBDb3VsZCBub3QgY29tcGxldGUgb3BlcmF0aW9uLiBNYWtlIHN1cmUgU2ltdWxhdG9yIFVJIGlzIHJ1bm5pbmcgYW5kIHRoZSBwYXJlbnQgQXBwaXVtIGFwcGxpY2F0aW9uIChlLiBnLiBBcHBpdW0uYXBwIG9yIFRlcm1pbmFsLmFwcCkgYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGBpcyBwcmVzZW50IGluIFN5c3RlbSBQcmVmZXJlbmNlcyA+IFNlY3VyaXR5ICYgUHJpdmFjeSA+IFByaXZhY3kgPiBBY2Nlc3NpYmlsaXR5IGxpc3QuIElmIHRoZSBvcGVyYXRpb24gaXMgc3RpbGwgdW5zdWNjZXNzZnVsIHRoZW4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGBpdCBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgU2ltdWxhdG9yLiBgICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYE9yaWdpbmFsIGVycm9yOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCBzdGF0ZSBvZiBCaW9tZXRyaWMgRW5yb2xsbWVudCBmZWF0dXJlLlxuICAgKlxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gRWl0aGVyIHRydWUgb3IgZmFsc2VcbiAgICogQHRocm93cyB7RXJyb3J9IElmIEVucm9sbG1lbnQgc3RhdGUgY2Fubm90IGJlIGRldGVybWluZWRcbiAgICovXG4gIGFzeW5jIGlzQmlvbWV0cmljRW5yb2xsZWQgKCkge1xuICAgIGNvbnN0IG91dHB1dCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVVJQ2xpZW50U2NyaXB0KGBcbiAgICAgIHRlbGwgYXBwbGljYXRpb24gXCJTeXN0ZW0gRXZlbnRzXCJcbiAgICAgICAgdGVsbCBwcm9jZXNzIFwiU2ltdWxhdG9yXCJcbiAgICAgICAgICBzZXQgZHN0TWVudUl0ZW0gdG8gbWVudSBpdGVtIFwiVG91Y2ggSUQgRW5yb2xsZWRcIiBvZiBtZW51IDEgb2YgbWVudSBiYXIgaXRlbSBcIkhhcmR3YXJlXCIgb2YgbWVudSBiYXIgMVxuICAgICAgICAgIHNldCBpc0NoZWNrZWQgdG8gKHZhbHVlIG9mIGF0dHJpYnV0ZSBcIkFYTWVudUl0ZW1NYXJrQ2hhclwiIG9mIGRzdE1lbnVJdGVtKSBpcyBcIuKck1wiXG4gICAgICAgIGVuZCB0ZWxsXG4gICAgICBlbmQgdGVsbFxuICAgIGApO1xuICAgIGxvZy5kZWJ1ZyhgVG91Y2ggSUQgZW5yb2xsZWQgc3RhdGU6ICR7b3V0cHV0fWApO1xuICAgIHJldHVybiBfLmlzU3RyaW5nKG91dHB1dCkgJiYgb3V0cHV0LnRyaW0oKSA9PT0gJ3RydWUnO1xuICB9XG5cbiAgLyoqXG4gICAqIEVucm9sbHMgYmlvbWV0cmljIChUb3VjaElkLCBGYWNlSWQpIGZlYXR1cmUgdGVzdGluZyBpbiBTaW11bGF0b3IgVUkgY2xpZW50LlxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzRW5hYmxlZCAtIERlZmluZXMgd2hldGhlciBiaW9tZXRyaWMgc3RhdGUgaXMgZW5hYmxlZC9kaXNhYmxlZFxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGVucm9sbGVkIHN0YXRlIGNhbm5vdCBiZSBjaGFuZ2VkXG4gICAqL1xuICBhc3luYyBlbnJvbGxCaW9tZXRyaWMgKGlzRW5hYmxlZCA9IHRydWUpIHtcbiAgICBhd2FpdCB0aGlzLmV4ZWN1dGVVSUNsaWVudFNjcmlwdChgXG4gICAgICB0ZWxsIGFwcGxpY2F0aW9uIFwiU3lzdGVtIEV2ZW50c1wiXG4gICAgICAgIHRlbGwgcHJvY2VzcyBcIlNpbXVsYXRvclwiXG4gICAgICAgICAgc2V0IGRzdE1lbnVJdGVtIHRvIG1lbnUgaXRlbSBcIlRvdWNoIElEIEVucm9sbGVkXCIgb2YgbWVudSAxIG9mIG1lbnUgYmFyIGl0ZW0gXCJIYXJkd2FyZVwiIG9mIG1lbnUgYmFyIDFcbiAgICAgICAgICBzZXQgaXNDaGVja2VkIHRvICh2YWx1ZSBvZiBhdHRyaWJ1dGUgXCJBWE1lbnVJdGVtTWFya0NoYXJcIiBvZiBkc3RNZW51SXRlbSkgaXMgXCLinJNcIlxuICAgICAgICAgIGlmICR7aXNFbmFibGVkID8gJ25vdCAnIDogJyd9aXNDaGVja2VkIHRoZW5cbiAgICAgICAgICAgIGNsaWNrIGRzdE1lbnVJdGVtXG4gICAgICAgICAgZW5kIGlmXG4gICAgICAgIGVuZCB0ZWxsXG4gICAgICBlbmQgdGVsbFxuICAgIGApO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmRzIGEgbm90aWZpY2F0aW9uIHRvIG1hdGNoL25vdCBtYXRjaCB0aGUgdG91Y2ggaWQuXG4gICAqXG4gICAqIEBwYXJhbSB7P2Jvb2xlYW59IHNob3VsZE1hdGNoIFt0cnVlXSAtIFNldCBpdCB0byB0cnVlIG9yIGZhbHNlIGluIG9yZGVyIHRvIGVtdWxhdGVcbiAgICogbWF0Y2hpbmcvbm90IG1hdGNoaW5nIHRoZSBjb3JyZXNwb25kaW5nIGJpb21ldHJpY1xuICAgKi9cbiAgYXN5bmMgc2VuZEJpb21ldHJpY01hdGNoIChzaG91bGRNYXRjaCA9IHRydWUpIHtcbiAgICBhd2FpdCB0aGlzLmV4ZWN1dGVVSUNsaWVudFNjcmlwdChgXG4gICAgICB0ZWxsIGFwcGxpY2F0aW9uIFwiU3lzdGVtIEV2ZW50c1wiXG4gICAgICAgIHRlbGwgcHJvY2VzcyBcIlNpbXVsYXRvclwiXG4gICAgICAgICAgc2V0IGRzdE1lbnVJdGVtIHRvIG1lbnUgaXRlbSBcIiR7c2hvdWxkTWF0Y2ggPyAnTWF0Y2hpbmcnIDogJ05vbi1tYXRjaGluZyd9XCIgb2YgbWVudSAxIG9mIG1lbnUgaXRlbSBcIlNpbXVsYXRlIEZpbmdlciBUb3VjaFwiIG9mIG1lbnUgMSBvZiBtZW51IGJhciBpdGVtIFwiSGFyZHdhcmVcIiBvZiBtZW51IGJhciAxXG4gICAgICAgICAgY2xpY2sgZHN0TWVudUl0ZW1cbiAgICAgICAgZW5kIHRlbGxcbiAgICAgIGVuZCB0ZWxsXG4gICAgYCk7XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBhIHNwZWNpYWwgQXBwbGUgc2NyaXB0LCB3aGljaCBjbGlja3MgdGhlIHBhcnRpY3VsYXIgYnV0dG9uIG9uIERhdGFiYXNlIGFsZXJ0LlxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGluY3JlYXNlIC0gQ2xpY2sgdGhlIGJ1dHRvbiB3aXRoICdJbmNyZWFzZScgdGl0bGUgb24gdGhlIGFsZXJ0IGlmIHRoaXNcbiAgICogICBwYXJhbWV0ZXIgaXMgdHJ1ZS4gVGhlICdDYW5jZWwnIGJ1dHRvbiB3aWxsIGJlIGNsaWNrZWQgb3RoZXJ3aXNlLlxuICAgKi9cbiAgYXN5bmMgZGlzbWlzc0RhdGFiYXNlQWxlcnQgKGluY3JlYXNlID0gdHJ1ZSkge1xuICAgIGxldCBidXR0b24gPSBpbmNyZWFzZSA/ICdJbmNyZWFzZScgOiAnQ2FuY2VsJztcbiAgICBsb2cuZGVidWcoYEF0dGVtcHRpbmcgdG8gZGlzbWlzcyBkYXRhYmFzZSBhbGVydCB3aXRoICcke2J1dHRvbn0nIGJ1dHRvbmApO1xuICAgIGF3YWl0IHRoaXMuZXhlY3V0ZVVJQ2xpZW50U2NyaXB0KGBcbiAgICAgIHRlbGwgYXBwbGljYXRpb24gXCJTeXN0ZW0gRXZlbnRzXCJcbiAgICAgICAgdGVsbCBwcm9jZXNzIFwiU2ltdWxhdG9yXCJcbiAgICAgICAgICBjbGljayBidXR0b24gXCIke2J1dHRvbn1cIiBvZiB3aW5kb3cgMVxuICAgICAgICBlbmQgdGVsbFxuICAgICAgZW5kIHRlbGxcbiAgICBgKTtcbiAgfVxuXG4gIC8vcmVnaW9uIEtleWNoYWlucyBJbnRlcmFjdGlvblxuICAvKipcbiAgICogQ3JlYXRlIHRoZSBiYWNrdXAgb2Yga2V5Y2hhaW5zIGZvbGRlci5cbiAgICogVGhlIHByZXZpb3VzbHkgY3JlYXRlZCBiYWNrdXAgd2lsbCBiZSBhdXRvbWF0aWNhbGx5XG4gICAqIGRlbGV0ZWQgaWYgdGhpcyBtZXRob2Qgd2FzIGNhbGxlZCB0d2ljZSBpbiBhIHJvdyB3aXRob3V0XG4gICAqIGByZXN0b3JlS2V5Y2hhaW5zYCBiZWluZyBpbnZva2VkLlxuICAgKlxuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgYmFja3VwIG9wZXJhdGlvbiB3YXMgc3VjY2Vzc2Z1bGwuXG4gICAqL1xuICBhc3luYyBiYWNrdXBLZXljaGFpbnMgKCkge1xuICAgIGlmICghYXdhaXQgZnMuZXhpc3RzKHRoaXMua2V5Y2hhaW5QYXRoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGJhY2t1cFBhdGggPSBhd2FpdCB0ZW1wRGlyLnBhdGgoe1xuICAgICAgcHJlZml4OiBga2V5Y2hhaW5zX2JhY2t1cF8ke01hdGguZmxvb3IoKDEgKyBNYXRoLnJhbmRvbSgpKSAqIDB4MTAwMDApLnRvU3RyaW5nKDE2KS5zdWJzdHJpbmcoMSl9YCxcbiAgICAgIHN1ZmZpeDogJy56aXAnLFxuICAgIH0pO1xuICAgIGNvbnN0IHppcEFyZ3MgPSBbXG4gICAgICAnLXInLCBiYWNrdXBQYXRoLFxuICAgICAgYCR7dGhpcy5rZXljaGFpblBhdGh9JHtwYXRoLnNlcH1gXG4gICAgXTtcbiAgICBsb2cuZGVidWcoYENyZWF0aW5nIGtleWNoYWlucyBiYWNrdXAgd2l0aCAnemlwICR7emlwQXJncy5qb2luKCcgJyl9JyBjb21tYW5kYCk7XG4gICAgYXdhaXQgZXhlYygnemlwJywgemlwQXJncyk7XG4gICAgaWYgKF8uaXNTdHJpbmcodGhpcy5fa2V5Y2hhaW5zQmFja3VwUGF0aCkgJiYgYXdhaXQgZnMuZXhpc3RzKHRoaXMuX2tleWNoYWluc0JhY2t1cFBhdGgpKSB7XG4gICAgICBhd2FpdCBmcy51bmxpbmsodGhpcy5fa2V5Y2hhaW5zQmFja3VwUGF0aCk7XG4gICAgfVxuICAgIHRoaXMuX2tleWNoYWluc0JhY2t1cFBhdGggPSBiYWNrdXBQYXRoO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc3RvcmUgdGhlIHByZXZpc291bHkgY3JlYXRlZCBrZXljaGFpbnMgYmFja3VwLlxuICAgKlxuICAgKiBAcGFyYW0gez9zdHJpbmd8QXJyYXk8c3RyaW5nPn0gZXhjbHVkZVBhdHRlcm5zIC0gVGhlIGxpc3RcbiAgICogb2YgZmlsZSBuYW1lIHBhdHRlcm5zIHRvIGJlIGV4Y2x1ZGVkIGZyb20gcmVzdG9yZS4gVGhlIGZvcm1hdFxuICAgKiBvZiBlYWNoIGl0ZW0gc2hvdWxkIGJlIHRoZSBzYW1lIGFzICcteCcgb3B0aW9uIGZvcm1hdCBmb3JcbiAgICogJ3VuemlwJyB1dGlsaXR5LiBUaGlzIGNhbiBhbHNvIGJlIGEgY29tbWEtc2VwYXJhdGVkIHN0cmluZyxcbiAgICogd2hpY2ggaXMgZ29pbmcgYmUgdHJhbnNmb3JtZWQgaW50byBhIGxpc3QgYXV0b21hdGljYWxseSxcbiAgICogZm9yIGV4YW1wbGU6ICcqLmRiKixibGFibGEuc3FsaXRlJ1xuICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gSWYgdGhlIHJlc3RvcmUgb3ByYXRpb24gd2FzIHN1Y2Nlc3NmdWwuXG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSBpcyBubyBrZXljaGFpbnMgYmFja3VwIGF2YWlsYWJsZSBmb3IgcmVzdG9yZS5cbiAgICovXG4gIGFzeW5jIHJlc3RvcmVLZXljaGFpbnMgKGV4Y2x1ZGVQYXR0ZXJucyA9IFtdKSB7XG4gICAgaWYgKCFfLmlzU3RyaW5nKHRoaXMuX2tleWNoYWluc0JhY2t1cFBhdGgpIHx8ICFhd2FpdCBmcy5leGlzdHModGhpcy5fa2V5Y2hhaW5zQmFja3VwUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVGhlIGtleWNoYWlucyBiYWNrdXAgYXJjaGl2ZSBkb2VzIG5vdCBleGlzdC4gYCArXG4gICAgICAgICAgICAgICAgICAgICAgYEFyZSB5b3Ugc3VyZSBpdCB3YXMgY3JlYXRlZCBiZWZvcmU/YCk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNTdHJpbmcoZXhjbHVkZVBhdHRlcm5zKSkge1xuICAgICAgZXhjbHVkZVBhdHRlcm5zID0gZXhjbHVkZVBhdHRlcm5zLnNwbGl0KCcsJykubWFwKCh4KSA9PiB4LnRyaW0oKSk7XG4gICAgfVxuICAgIGNvbnN0IHtzdGF0ZX0gPSBhd2FpdCB0aGlzLnN0YXQoKTtcbiAgICBjb25zdCBpc1NlcnZlclJ1bm5pbmcgPSBzdGF0ZSA9PT0gJ0Jvb3RlZCc7XG4gICAgbGV0IHBsaXN0UGF0aDtcbiAgICBpZiAoaXNTZXJ2ZXJSdW5uaW5nKSB7XG4gICAgICBwbGlzdFBhdGggPSBwYXRoLnJlc29sdmUoYXdhaXQgdGhpcy5nZXRMYXVuY2hEYWVtb25zUm9vdCgpLCAnY29tLmFwcGxlLnNlY3VyaXR5ZC5wbGlzdCcpO1xuICAgICAgaWYgKCFhd2FpdCBmcy5leGlzdHMocGxpc3RQYXRoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjbGVhciBrZXljaGFpbnMgYmVjYXVzZSAnJHtwbGlzdFBhdGh9JyBkb2VzIG5vdCBleGlzdGApO1xuICAgICAgfVxuICAgICAgYXdhaXQgc2ltY3RsLnNwYXduKHRoaXMudWRpZCwgWydsYXVuY2hjdGwnLCAndW5sb2FkJywgcGxpc3RQYXRoXSk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5yaW1yYWYodGhpcy5rZXljaGFpblBhdGgpO1xuICAgICAgYXdhaXQgbWtkaXJwKHRoaXMua2V5Y2hhaW5QYXRoKTtcbiAgICAgIGNvbnN0IHVuemlwQXJncyA9IFtcbiAgICAgICAgJy1vJywgdGhpcy5fa2V5Y2hhaW5zQmFja3VwUGF0aCxcbiAgICAgICAgLi4uKF8uZmxhdE1hcChleGNsdWRlUGF0dGVybnMubWFwKCh4KSA9PiBbJy14JywgeF0pKSksXG4gICAgICAgICctZCcsICcvJ1xuICAgICAgXTtcbiAgICAgIGxvZy5kZWJ1ZyhgUmVzdG9yaW5nIGtleWNoYWlucyB3aXRoICd1bnppcCAke3VuemlwQXJncy5qb2luKCcgJyl9JyBjb21tYW5kYCk7XG4gICAgICBhd2FpdCBleGVjKCd1bnppcCcsIHVuemlwQXJncyk7XG4gICAgICBhd2FpdCBmcy51bmxpbmsodGhpcy5fa2V5Y2hhaW5zQmFja3VwUGF0aCk7XG4gICAgICB0aGlzLl9rZXljaGFpbnNCYWNrdXBQYXRoID0gbnVsbDtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaWYgKGlzU2VydmVyUnVubmluZyAmJiBwbGlzdFBhdGgpIHtcbiAgICAgICAgYXdhaXQgc2ltY3RsLnNwYXduKHRoaXMudWRpZCwgWydsYXVuY2hjdGwnLCAnbG9hZCcsIHBsaXN0UGF0aF0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhcnMgS2V5Y2hhaW5zIGZvciB0aGUgcGFydGljdWxhciBzaW11bGF0b3IgaW4gcnVudGltZSAodGhlcmUgaXMgbm8gbmVlZCB0byBzdG9wIGl0KS5cbiAgICpcbiAgICogQHRocm93cyB7RXJyb3J9IElmIGtleWNoYWluIGNsZWFudXAgaGFzIGZhaWxlZC5cbiAgICovXG4gIGFzeW5jIGNsZWFyS2V5Y2hhaW5zICgpIHtcbiAgICBjb25zdCBwbGlzdFBhdGggPSBwYXRoLnJlc29sdmUoYXdhaXQgdGhpcy5nZXRMYXVuY2hEYWVtb25zUm9vdCgpLCAnY29tLmFwcGxlLnNlY3VyaXR5ZC5wbGlzdCcpO1xuICAgIGlmICghYXdhaXQgZnMuZXhpc3RzKHBsaXN0UGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNsZWFyIGtleWNoYWlucyBiZWNhdXNlICcke3BsaXN0UGF0aH0nIGRvZXMgbm90IGV4aXN0YCk7XG4gICAgfVxuICAgIGF3YWl0IHNpbWN0bC5zcGF3bih0aGlzLnVkaWQsIFsnbGF1bmNoY3RsJywgJ3VubG9hZCcsIHBsaXN0UGF0aF0pO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXdhaXQgZnMuZXhpc3RzKHRoaXMua2V5Y2hhaW5QYXRoKSkge1xuICAgICAgICBhd2FpdCBmcy5yaW1yYWYodGhpcy5rZXljaGFpblBhdGgpO1xuICAgICAgICBhd2FpdCBta2RpcnAodGhpcy5rZXljaGFpblBhdGgpO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICBhd2FpdCBzaW1jdGwuc3Bhd24odGhpcy51ZGlkLCBbJ2xhdW5jaGN0bCcsICdsb2FkJywgcGxpc3RQYXRoXSk7XG4gICAgfVxuICB9XG5cbiAgLy9lbmRyZWdpb25cblxuICAvKipcbiAgICogU2V0cyB0aGUgcGFydGljdWxhciBwZXJtaXNzaW9uIHRvIHRoZSBhcHBsaWNhdGlvbiBidW5kbGUuIFNlZVxuICAgKiBodHRwczovL2dpdGh1Yi5jb20vd2l4L0FwcGxlU2ltdWxhdG9yVXRpbHMgZm9yIG1vcmUgZGV0YWlscyBvblxuICAgKiB0aGUgYXZhaWxhYmxlIHNlcnZpY2UgbmFtZXMgYW5kIHN0YXR1c2VzLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gYnVuZGxlSWQgLSBBcHBsaWNhdGlvbiBidW5kbGUgaWRlbnRpZmllci5cbiAgICogQHBhcmFtIHtzdHJpbmd9IHBlcm1pc3Npb24gLSBTZXJ2aWNlIG5hbWUgdG8gYmUgc2V0LlxuICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBUaGUgZGVzaXJlZCBzdGF0dXMgZm9yIHRoZSBzZXJ2aWNlLlxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlcmUgd2FzIGFuIGVycm9yIHdoaWxlIGNoYW5naW5nIHBlcm1pc3Npb24uXG4gICAqL1xuICBhc3luYyBzZXRQZXJtaXNzaW9uIChidW5kbGVJZCwgcGVybWlzc2lvbiwgdmFsdWUpIHtcbiAgICBhd2FpdCB0aGlzLnNldFBlcm1pc3Npb25zKGJ1bmRsZUlkLCB7W3Blcm1pc3Npb25dOiB2YWx1ZX0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgcGFydGljdWxhciBhcHBsaWNhdGlvbiBidW5kbGUuXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBidW5kbGVJZCAtIEFwcGxpY2F0aW9uIGJ1bmRsZSBpZGVudGlmaWVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGVybWlzc2lvbnNNYXBwaW5nIC0gQSBtYXBwaW5nIHdoZXJlIGtheXNcbiAgICogYXJlIHNlcnZpY2UgbmFtZXMgYW5kIHZhbHVlcyBhcmUgdGhlaXIgY29ycmVzcG9uZGluZyBzdGF0dXMgdmFsdWVzLlxuICAgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL3dpeC9BcHBsZVNpbXVsYXRvclV0aWxzXG4gICAqIGZvciBtb3JlIGRldGFpbHMgb24gYXZhaWxhYmxlIHNlcnZpY2UgbmFtZXMgYW5kIHN0YXR1c2VzLlxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlcmUgd2FzIGFuIGVycm9yIHdoaWxlIGNoYW5naW5nIHBlcm1pc3Npb25zLlxuICAgKi9cbiAgYXN5bmMgc2V0UGVybWlzc2lvbnMgKGJ1bmRsZUlkLCBwZXJtaXNzaW9uc01hcHBpbmcpIHtcbiAgICBhd2FpdCB0aGlzLnBlcm1pc3Npb25zLnNldEFjY2VzcyhidW5kbGVJZCwgcGVybWlzc2lvbnNNYXBwaW5nKTtcbiAgICBsb2cuZGVidWcoYFNldCAke0pTT04uc3RyaW5naWZ5KHBlcm1pc3Npb25zTWFwcGluZyl9IGFjY2VzcyBmb3IgJyR7YnVuZGxlSWR9J2ApO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHJpZXZlcyBjdXJyZW50IHBlcm1pc3Npb24gc3RhdHVzIGZvciB0aGUgZ2l2ZW4gYXBwbGljYXRpb24gYnVuZGxlLlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gYnVuZGxlSWQgLSBBcHBsaWNhdGlvbiBidW5kbGUgaWRlbnRpZmllci5cbiAgICogQHBhcmFtIHtzdHJpbmd9IHNlcnZpY2VOYW1lIC0gT25lIG9mIGF2YWlsYWJsZSBzZXJ2aWNlIG5hbWVzLlxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlcmUgd2FzIGFuIGVycm9yIHdoaWxlIHJldHJpZXZpbmcgcGVybWlzc2lvbnMuXG4gICAqL1xuICBhc3luYyBnZXRQZXJtaXNzaW9uIChidW5kbGVJZCwgc2VydmljZU5hbWUpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBlcm1pc3Npb25zLmdldEFjY2VzcyhidW5kbGVJZCwgc2VydmljZU5hbWUpO1xuICAgIGxvZy5kZWJ1ZyhgR290ICR7c2VydmljZU5hbWV9IGFjY2VzcyBzdGF0dXMgZm9yICcke2J1bmRsZUlkfSc6ICR7cmVzdWx0fWApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyBnZXRMYXVuY2hEYWVtb25zUm9vdCAoKSB7XG4gICAgY29uc3QgZGV2Um9vdCA9IGF3YWl0IGdldERldmVsb3BlclJvb3QoKTtcbiAgICByZXR1cm4gcGF0aC5yZXNvbHZlKGRldlJvb3QsXG4gICAgICAnUGxhdGZvcm1zL2lQaG9uZVNpbXVsYXRvci5wbGF0Zm9ybS9EZXZlbG9wZXIvU0RLcy9pUGhvbmVTaW11bGF0b3Iuc2RrL1N5c3RlbS9MaWJyYXJ5L0xhdW5jaERhZW1vbnMnKTtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyBfZ2V0RGV2aWNlU3RyaW5nUGxhdGZvcm1WZXJzaW9uIChwbGF0Zm9ybVZlcnNpb24pIHtcbiAgICBsZXQgcmVxVmVyc2lvbiA9IHBsYXRmb3JtVmVyc2lvbjtcbiAgICBpZiAoIXJlcVZlcnNpb24pIHtcbiAgICAgIHJlcVZlcnNpb24gPSBhd2FpdCB4Y29kZS5nZXRNYXhJT1NTREsoKTtcbiAgICAgIGxvZy53YXJuKGBObyBwbGF0Zm9ybSB2ZXJzaW9uIHNldC4gVXNpbmcgbWF4IFNESyB2ZXJzaW9uOiAke3JlcVZlcnNpb259YCk7XG4gICAgICAvLyB0aGlzIHdpbGwgYmUgYSBudW1iZXIsIGFuZCBwb3NzaWJseSBhbiBpbnRlZ2VyIChlLmcuLCBpZiBtYXggaU9TIFNESyBpcyA5KVxuICAgICAgLy8gc28gdHVybiBpdCBpbnRvIGEgc3RyaW5nIGFuZCBhZGQgYSAuMCBpZiBuZWNlc3NhcnlcbiAgICAgIGlmICghXy5pc1N0cmluZyhyZXFWZXJzaW9uKSkge1xuICAgICAgICByZXFWZXJzaW9uID0gKHJlcVZlcnNpb24gJSAxKSA/IFN0cmluZyhyZXFWZXJzaW9uKSA6IGAke3JlcVZlcnNpb259LjBgO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVxVmVyc2lvbjtcbiAgfVxuXG4gIC8vIGNoYW5nZSB0aGUgZm9ybWF0IGluIHN1YmNsYXNzZXMsIGFzIG5lY2Vzc2FyeVxuICBzdGF0aWMgYXN5bmMgX2dldERldmljZVN0cmluZ1ZlcnNpb25TdHJpbmcgKHBsYXRmb3JtVmVyc2lvbikge1xuICAgIGxldCByZXFWZXJzaW9uID0gYXdhaXQgdGhpcy5fZ2V0RGV2aWNlU3RyaW5nUGxhdGZvcm1WZXJzaW9uKHBsYXRmb3JtVmVyc2lvbik7XG5cbiAgICByZXR1cm4gYCgke3JlcVZlcnNpb259IFNpbXVsYXRvcilgO1xuICB9XG5cbiAgLy8gY2hhbmdlIHRoZSBmb3JtYXQgaW4gc3ViY2xhc3NlcywgYXMgbmVjZXNzYXJ5XG4gIHN0YXRpYyBfZ2V0RGV2aWNlU3RyaW5nQ29uZmlnRml4ICgpIHtcbiAgICAvLyBzb21lIGRldmljZXMgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgcmV0dXJuIHtcbiAgICAgICdpUGFkIFNpbXVsYXRvciAoNy4xIFNpbXVsYXRvciknOiAnaVBhZCAyICg3LjEgU2ltdWxhdG9yKScsXG4gICAgICAnaVBhZCBTaW11bGF0b3IgKDguMCBTaW11bGF0b3IpJzogJ2lQYWQgMiAoOC4wIFNpbXVsYXRvciknLFxuICAgICAgJ2lQYWQgU2ltdWxhdG9yICg4LjEgU2ltdWxhdG9yKSc6ICdpUGFkIDIgKDguMSBTaW11bGF0b3IpJyxcbiAgICAgICdpUGFkIFNpbXVsYXRvciAoOC4yIFNpbXVsYXRvciknOiAnaVBhZCAyICg4LjIgU2ltdWxhdG9yKScsXG4gICAgICAnaVBhZCBTaW11bGF0b3IgKDguMyBTaW11bGF0b3IpJzogJ2lQYWQgMiAoOC4zIFNpbXVsYXRvciknLFxuICAgICAgJ2lQYWQgU2ltdWxhdG9yICg4LjQgU2ltdWxhdG9yKSc6ICdpUGFkIDIgKDguNCBTaW11bGF0b3IpJyxcbiAgICAgICdpUGhvbmUgU2ltdWxhdG9yICg3LjEgU2ltdWxhdG9yKSc6ICdpUGhvbmUgNXMgKDcuMSBTaW11bGF0b3IpJyxcbiAgICAgICdpUGhvbmUgU2ltdWxhdG9yICg4LjQgU2ltdWxhdG9yKSc6ICdpUGhvbmUgNiAoOC40IFNpbXVsYXRvciknLFxuICAgICAgJ2lQaG9uZSBTaW11bGF0b3IgKDguMyBTaW11bGF0b3IpJzogJ2lQaG9uZSA2ICg4LjMgU2ltdWxhdG9yKScsXG4gICAgICAnaVBob25lIFNpbXVsYXRvciAoOC4yIFNpbXVsYXRvciknOiAnaVBob25lIDYgKDguMiBTaW11bGF0b3IpJyxcbiAgICAgICdpUGhvbmUgU2ltdWxhdG9yICg4LjEgU2ltdWxhdG9yKSc6ICdpUGhvbmUgNiAoOC4xIFNpbXVsYXRvciknLFxuICAgICAgJ2lQaG9uZSBTaW11bGF0b3IgKDguMCBTaW11bGF0b3IpJzogJ2lQaG9uZSA2ICg4LjAgU2ltdWxhdG9yKSdcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRha2VzIGEgc2V0IG9mIG9wdGlvbnMgYW5kIGZpbmRzIHRoZSBjb3JyZWN0IGRldmljZSBzdHJpbmcgaW4gb3JkZXIgZm9yIEluc3RydW1lbnRzIHRvXG4gICAqIGlkZW50aWZ5IHRoZSBjb3JyZWN0IHNpbXVsYXRvci5cbiAgICpcbiAgICogQHBhcmFtIHtvYmplY3R9IG9wdHMgLSBUaGUgb3B0aW9ucyBhdmFpbGFibGUgYXJlOlxuICAgKiAgIC0gYGRldmljZU5hbWVgIC0gYSBuYW1lIGZvciB0aGUgZGV2aWNlLiBJZiB0aGUgZ2l2ZW4gZGV2aWNlIG5hbWUgc3RhcnRzIHdpdGggYD1gLCB0aGUgbmFtZSwgbGVzcyB0aGUgZXF1YWxzIHNpZ24sIGlzIHJldHVybmVkLlxuICAgKiAgIC0gYHBsYXRmb3JtVmVyc2lvbmAgLSB0aGUgdmVyc2lvbiBvZiBpT1MgdG8gdXNlLiBEZWZhdWx0cyB0byB0aGUgY3VycmVudCBYY29kZSdzIG1heGltdW0gU0RLIHZlcnNpb24uXG4gICAqICAgLSBgZm9yY2VJcGhvbmVgIC0gZm9yY2UgdGhlIGNvbmZpZ3VyYXRpb24gb2YgdGhlIGRldmljZSBzdHJpbmcgdG8gaVBob25lLiBEZWZhdWx0cyB0byBgZmFsc2VgLlxuICAgKiAgIC0gYGZvcmNlSXBhZGAgLSBmb3JjZSB0aGUgY29uZmlndXJhdGlvbiBvZiB0aGUgZGV2aWNlIHN0cmluZyB0byBpUGFkLiBEZWZhdWx0cyB0byBgZmFsc2VgLlxuICAgKiAgIElmIGJvdGggYGZvcmNlSXBob25lYCBhbmQgYGZvcmNlSXBhZGAgYXJlIHRydWUsIHRoZSBkZXZpY2Ugd2lsbCBiZSBmb3JjZWQgdG8gaVBob25lLlxuICAgKlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBmb3VuZCBkZXZpY2Ugc3RyaW5nLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGdldERldmljZVN0cmluZyAob3B0cykge1xuICAgIG9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCB7XG4gICAgICBkZXZpY2VOYW1lOiBudWxsLFxuICAgICAgcGxhdGZvcm1WZXJzaW9uOiBudWxsLFxuICAgICAgZm9yY2VJcGhvbmU6IGZhbHNlLFxuICAgICAgZm9yY2VJcGFkOiBmYWxzZVxuICAgIH0sIG9wdHMpO1xuICAgIGxldCBsb2dPcHRzID0ge1xuICAgICAgZGV2aWNlTmFtZTogb3B0cy5kZXZpY2VOYW1lLFxuICAgICAgcGxhdGZvcm1WZXJzaW9uOiBvcHRzLnBsYXRmb3JtVmVyc2lvbixcbiAgICAgIGZvcmNlSXBob25lOiBvcHRzLmZvcmNlSXBob25lLFxuICAgICAgZm9yY2VJcGFkOiBvcHRzLmZvcmNlSXBhZFxuICAgIH07XG4gICAgbG9nLmRlYnVnKGBHZXR0aW5nIGRldmljZSBzdHJpbmcgZnJvbSBvcHRpb25zOiAke0pTT04uc3RyaW5naWZ5KGxvZ09wdHMpfWApO1xuXG4gICAgLy8gc2hvcnQgY2lyY3VpdCBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBkZXZpY2UgbmFtZVxuICAgIGlmICgob3B0cy5kZXZpY2VOYW1lIHx8ICcnKVswXSA9PT0gJz0nKSB7XG4gICAgICByZXR1cm4gb3B0cy5kZXZpY2VOYW1lLnN1YnN0cmluZygxKTtcbiAgICB9XG5cbiAgICBsZXQgaXNpUGhvbmUgPSAhIW9wdHMuZm9yY2VJcGhvbmUgfHwgIW9wdHMuZm9yY2VJcGFkO1xuXG4gICAgaWYgKG9wdHMuZGV2aWNlTmFtZSkge1xuICAgICAgbGV0IGRldmljZSA9IG9wdHMuZGV2aWNlTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGRldmljZS5pbmRleE9mKCdpcGhvbmUnKSAhPT0gLTEpIHtcbiAgICAgICAgaXNpUGhvbmUgPSB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChkZXZpY2UuaW5kZXhPZignaXBhZCcpICE9PSAtMSkge1xuICAgICAgICBpc2lQaG9uZSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBpb3NEZXZpY2VTdHJpbmcgPSBvcHRzLmRldmljZU5hbWUgfHwgKGlzaVBob25lID8gJ2lQaG9uZSBTaW11bGF0b3InIDogJ2lQYWQgU2ltdWxhdG9yJyk7XG5cbiAgICAvLyBpZiBzb21lb25lIHBhc3NlcyBpbiBqdXN0IFwiaVBob25lXCIsIG1ha2UgdGhhdCBcImlQaG9uZSBTaW11bGF0b3JcIiB0b1xuICAgIC8vIGNvbmZvcm0gdG8gYWxsIHRoZSBsb2dpYyBiZWxvd1xuICAgIGlmICgvXihpUGhvbmV8aVBhZCkkLy50ZXN0KGlvc0RldmljZVN0cmluZykpIHtcbiAgICAgIGlvc0RldmljZVN0cmluZyArPSAnIFNpbXVsYXRvcic7XG4gICAgfVxuXG4gICAgLy8gd2Ugc3VwcG9ydCBkZXZpY2VOYW1lOiBcImlQaG9uZSBTaW11bGF0b3JcIiwgYW5kIGFsc28gd2FudCB0byBzdXBwb3J0XG4gICAgLy8gXCJpUGhvbmUgWFlaIFNpbXVsYXRvclwiLCBidXQgdGhlc2Ugc3RyaW5ncyBhcmVuJ3QgaW4gdGhlIGRldmljZSBsaXN0LlxuICAgIC8vIFNvLCBpZiBzb21lb25lIHNlbnQgaW4gXCJpUGhvbmUgWFlaIFNpbXVsYXRvclwiLCBzdHJpcCBvZmYgXCIgU2ltdWxhdG9yXCJcbiAgICAvLyBpbiBvcmRlciB0byBhbGxvdyB0aGUgZGVmYXVsdCBcImlQaG9uZSBYWVpcIiBtYXRjaFxuICAgIGlmICgvW14oaVBob25lfGlQYWQpXSBTaW11bGF0b3IvLnRlc3QoaW9zRGV2aWNlU3RyaW5nKSkge1xuICAgICAgaW9zRGV2aWNlU3RyaW5nID0gaW9zRGV2aWNlU3RyaW5nLnJlcGxhY2UoJyBTaW11bGF0b3InLCAnJyk7XG4gICAgfVxuICAgIGlvc0RldmljZVN0cmluZyArPSBgICR7YXdhaXQgdGhpcy5fZ2V0RGV2aWNlU3RyaW5nVmVyc2lvblN0cmluZyhvcHRzLnBsYXRmb3JtVmVyc2lvbil9YDtcblxuICAgIGxldCBDT05GSUdfRklYID0gdGhpcy5fZ2V0RGV2aWNlU3RyaW5nQ29uZmlnRml4KCk7XG5cbiAgICBsZXQgY29uZmlnRml4ID0gQ09ORklHX0ZJWDtcbiAgICBpZiAoY29uZmlnRml4W2lvc0RldmljZVN0cmluZ10pIHtcbiAgICAgIGlvc0RldmljZVN0cmluZyA9IGNvbmZpZ0ZpeFtpb3NEZXZpY2VTdHJpbmddO1xuICAgICAgbG9nLmRlYnVnKGBGaXhpbmcgZGV2aWNlLiBDaGFuZ2VkIGZyb20gJyR7b3B0cy5kZXZpY2VOYW1lfScgYCArXG4gICAgICAgICAgICAgICAgYHRvICcke2lvc0RldmljZVN0cmluZ30nYCk7XG4gICAgfVxuXG4gICAgbG9nLmRlYnVnKGBGaW5hbCBkZXZpY2Ugc3RyaW5nIGlzICcke2lvc0RldmljZVN0cmluZ30nYCk7XG4gICAgcmV0dXJuIGlvc0RldmljZVN0cmluZztcbiAgfVxuXG4gIC8qKlxuICAgKiBAcmV0dXJuIHs/c3RyaW5nfSBUaGUgZnVsbCBwYXRoIHRvIHRoZSBzaW11bGF0b3IncyBXZWJJbnNwZWN0b3IgVW5peCBEb21haW4gU29ja2V0XG4gICAqICAgb3IgYG51bGxgIGlmIHRoZXJlIGlzIG5vIHNvY2tldC5cbiAgICovXG4gIGFzeW5jIGdldFdlYkluc3BlY3RvclNvY2tldCAoKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgcmVxdWlyZS1hd2FpdFxuICAgIC8vIHRoZXJlIGlzIG5vIFdlYkluc3BlY3RvciBzb2NrZXQgZm9yIHRoaXMgdmVyc2lvbiBvZiBYY29kZVxuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmZvciAobGV0IFtjbWQsIGZuXSBvZiBfLnRvUGFpcnMoZXh0ZW5zaW9ucykpIHtcbiAgU2ltdWxhdG9yWGNvZGU2LnByb3RvdHlwZVtjbWRdID0gZm47XG59XG5cbmV4cG9ydCBkZWZhdWx0IFNpbXVsYXRvclhjb2RlNjtcbmV4cG9ydCB7IFNpbXVsYXRvclhjb2RlNiwgQk9PVF9DT01QTEVURURfRVZFTlQsIFNQUklOR0JPQVJEX0JVTkRMRV9JRCB9O1xuIl0sImZpbGUiOiJsaWIvc2ltdWxhdG9yLXhjb2RlLTYuanMiLCJzb3VyY2VSb290IjoiLi4vLi4ifQ==
