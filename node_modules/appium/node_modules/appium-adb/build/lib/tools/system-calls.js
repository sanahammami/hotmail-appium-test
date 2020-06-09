"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "DEFAULT_ADB_EXEC_TIMEOUT", {
  enumerable: true,
  get: function () {
    return _helpers.DEFAULT_ADB_EXEC_TIMEOUT;
  }
});
exports.default = void 0;

require("source-map-support/register");

var _path = _interopRequireDefault(require("path"));

var _logger = _interopRequireDefault(require("../logger.js"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _appiumSupport = require("appium-support");

var _helpers = require("../helpers");

var _teen_process = require("teen_process");

var _asyncbox = require("asyncbox");

var _lodash = _interopRequireDefault(require("lodash"));

var _shellQuote = require("shell-quote");

let systemCallMethods = {};
const DEFAULT_ADB_REBOOT_RETRIES = 90;
const LINKER_WARNING_REGEXP = /^WARNING: linker.+$/m;
const PROTOCOL_FAULT_ERROR_REGEXP = new RegExp('protocol fault \\(no status\\)', 'i');
const DEVICE_NOT_FOUND_ERROR_REGEXP = new RegExp(`error: device ('.+' )?not found`, 'i');
const DEVICE_CONNECTING_ERROR_REGEXP = new RegExp('error: device still connecting', 'i');
const CERTS_ROOT = '/system/etc/security/cacerts';

systemCallMethods.getSdkBinaryPath = async function getSdkBinaryPath(binaryName) {
  if (this.sdkRoot) {
    return await this.getBinaryFromSdkRoot(binaryName);
  }

  _logger.default.warn(`The ANDROID_HOME environment variable is not set to the Android SDK ` + `root directory path. ANDROID_HOME is required for compatibility ` + `with SDK 23+. Checking along PATH for ${binaryName}.`);

  return await this.getBinaryFromPath(binaryName);
};

systemCallMethods.getBinaryNameForOS = _lodash.default.memoize(function getBinaryNameForOS(binaryName) {
  if (!_appiumSupport.system.isWindows()) {
    return binaryName;
  }

  if (['android', 'apksigner', 'apkanalyzer'].includes(binaryName)) {
    return `${binaryName}.bat`;
  }

  if (!_path.default.extname(binaryName)) {
    return `${binaryName}.exe`;
  }

  return binaryName;
});

systemCallMethods.getBinaryFromSdkRoot = async function getBinaryFromSdkRoot(binaryName) {
  if (this.binaries[binaryName]) {
    return this.binaries[binaryName];
  }

  const fullBinaryName = this.getBinaryNameForOS(binaryName);
  const binaryLocs = ['platform-tools', 'emulator', 'tools', `tools${_path.default.sep}bin`].map(x => _path.default.resolve(this.sdkRoot, x, fullBinaryName));
  let buildToolsDirs = await (0, _helpers.getBuildToolsDirs)(this.sdkRoot);

  if (this.buildToolsVersion) {
    buildToolsDirs = buildToolsDirs.filter(x => _path.default.basename(x) === this.buildToolsVersion);

    if (_lodash.default.isEmpty(buildToolsDirs)) {
      _logger.default.info(`Found no build tools whose version matches to '${this.buildToolsVersion}'`);
    } else {
      _logger.default.info(`Using build tools at '${buildToolsDirs}'`);
    }
  }

  binaryLocs.push(...buildToolsDirs.map(dir => _path.default.resolve(dir, fullBinaryName)));
  let binaryLoc = null;

  for (const loc of binaryLocs) {
    if (await _appiumSupport.fs.exists(loc)) {
      binaryLoc = loc;
      break;
    }
  }

  if (_lodash.default.isNull(binaryLoc)) {
    throw new Error(`Could not find '${fullBinaryName}' in ${JSON.stringify(binaryLocs)}. ` + `Do you have Android Build Tools ${this.buildToolsVersion ? `v ${this.buildToolsVersion} ` : ''}` + `installed at '${this.sdkRoot}'?`);
  }

  _logger.default.info(`Using '${fullBinaryName}' from '${binaryLoc}'`);

  this.binaries[binaryName] = binaryLoc;
  return binaryLoc;
};

systemCallMethods.getBinaryFromPath = async function getBinaryFromPath(binaryName) {
  if (this.binaries[binaryName]) {
    return this.binaries[binaryName];
  }

  const fullBinaryName = this.getBinaryNameForOS(binaryName);

  try {
    const binaryLoc = await _appiumSupport.fs.which(fullBinaryName);

    _logger.default.info(`Using '${fullBinaryName}' from '${binaryLoc}'`);

    this.binaries[binaryName] = binaryLoc;
    return binaryLoc;
  } catch (e) {
    throw new Error(`Could not find '${fullBinaryName}' in PATH. Please set the ANDROID_HOME ` + `or ANDROID_SDK_ROOT environment variables to the corect Android SDK root directory path.`);
  }
};

systemCallMethods.getConnectedDevices = async function getConnectedDevices() {
  _logger.default.debug('Getting connected devices...');

  let stdout;

  try {
    ({
      stdout
    } = await (0, _teen_process.exec)(this.executable.path, [...this.executable.defaultArgs, 'devices']));
  } catch (e) {
    throw new Error(`Error while getting connected devices. Original error: ${e.message}`);
  }

  const listHeader = 'List of devices';
  const startingIndex = stdout.indexOf(listHeader);

  if (startingIndex < 0) {
    throw new Error(`Unexpected output while trying to get devices: ${stdout}`);
  }

  stdout = stdout.slice(startingIndex);
  const excludedLines = [listHeader, 'adb server', '* daemon', 'offline'];
  const devices = stdout.split('\n').map(_lodash.default.trim).filter(line => line && !excludedLines.some(x => line.includes(x))).reduce((acc, line) => {
    const [udid, state] = line.split(/\s+/);
    acc.push({
      udid,
      state
    });
    return acc;
  }, []);

  if (_lodash.default.isEmpty(devices)) {
    _logger.default.debug('No connected devices have been detected');
  } else {
    _logger.default.debug(`Connected devices: ${JSON.stringify(devices)}`);
  }

  return devices;
};

systemCallMethods.getDevicesWithRetry = async function getDevicesWithRetry(timeoutMs = 20000) {
  let start = Date.now();

  _logger.default.debug('Trying to find a connected android device');

  let getDevices = async () => {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Could not find a connected Android device.');
    }

    try {
      let devices = await this.getConnectedDevices();

      if (devices.length < 1) {
        _logger.default.debug('Could not find devices, restarting adb server...');

        await this.restartAdb();
        await (0, _asyncbox.sleep)(200);
        return await getDevices();
      }

      return devices;
    } catch (e) {
      _logger.default.debug('Could not find devices, restarting adb server...');

      await this.restartAdb();
      await (0, _asyncbox.sleep)(200);
      return await getDevices();
    }
  };

  return await getDevices();
};

systemCallMethods.restartAdb = async function restartAdb() {
  if (this.suppressKillServer) {
    _logger.default.debug(`Not restarting abd since 'suppressKillServer' is on`);

    return;
  }

  _logger.default.debug('Restarting adb');

  try {
    await this.killServer();
  } catch (e) {
    _logger.default.error(`Error killing ADB server, going to see if it's online anyway`);
  }
};

systemCallMethods.killServer = async function killServer() {
  _logger.default.debug(`Killing adb server on port ${this.adbPort}`);

  await this.adbExec(['kill-server'], {
    exclusive: true
  });
};

systemCallMethods.resetTelnetAuthToken = _lodash.default.memoize(async function resetTelnetAuthToken() {
  const homeFolderPath = process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'];

  if (!homeFolderPath) {
    _logger.default.warn(`Cannot find the path to user home folder. Ignoring resetting of emulator's telnet authentication token`);

    return false;
  }

  const dstPath = _path.default.resolve(homeFolderPath, '.emulator_console_auth_token');

  _logger.default.debug(`Overriding ${dstPath} with an empty string to avoid telnet authentication for emulator commands`);

  try {
    await _appiumSupport.fs.writeFile(dstPath, '');
  } catch (e) {
    _logger.default.warn(`Error ${e.message} while resetting the content of ${dstPath}. Ignoring resetting of emulator's telnet authentication token`);

    return false;
  }

  return true;
});

systemCallMethods.adbExecEmu = async function adbExecEmu(cmd) {
  await this.verifyEmulatorConnected();
  await this.resetTelnetAuthToken();
  await this.adbExec(['emu', ...cmd]);
};

let isExecLocked = false;

systemCallMethods.adbExec = async function adbExec(cmd, opts = {}) {
  if (!cmd) {
    throw new Error('You need to pass in a command to adbExec()');
  }

  opts = _lodash.default.cloneDeep(opts);
  opts.timeout = opts.timeout || this.adbExecTimeout || _helpers.DEFAULT_ADB_EXEC_TIMEOUT;
  opts.timeoutCapName = opts.timeoutCapName || 'adbExecTimeout';
  cmd = _lodash.default.isArray(cmd) ? cmd : [cmd];
  let adbRetried = false;

  const execFunc = async () => {
    try {
      const args = [...this.executable.defaultArgs, ...cmd];

      _logger.default.debug(`Running '${this.executable.path} ${(0, _shellQuote.quote)(args)}'`);

      let {
        stdout
      } = await (0, _teen_process.exec)(this.executable.path, args, opts);
      stdout = stdout.replace(LINKER_WARNING_REGEXP, '').trim();
      return stdout;
    } catch (e) {
      const errText = `${e.message}, ${e.stdout}, ${e.stderr}`;
      const protocolFaultError = PROTOCOL_FAULT_ERROR_REGEXP.test(errText);
      const deviceNotFoundError = DEVICE_NOT_FOUND_ERROR_REGEXP.test(errText);
      const deviceConnectingError = DEVICE_CONNECTING_ERROR_REGEXP.test(errText);

      if (protocolFaultError || deviceNotFoundError || deviceConnectingError) {
        _logger.default.info(`Error sending command, reconnecting device and retrying: ${cmd}`);

        await (0, _asyncbox.sleep)(1000);
        await this.getDevicesWithRetry();

        if (adbRetried) {
          adbRetried = true;
          return await execFunc();
        }
      }

      if (e.code === 0 && e.stdout) {
        return e.stdout.replace(LINKER_WARNING_REGEXP, '').trim();
      }

      if (_lodash.default.isNull(e.code)) {
        e.message = `Error executing adbExec. Original error: '${e.message}'. ` + `Try to increase the ${opts.timeout}ms adb execution timeout represented by '${opts.timeoutCapName}' capability`;
      } else {
        e.message = `Error executing adbExec. Original error: '${e.message}'; ` + `Stderr: '${(e.stderr || '').trim()}'; Code: '${e.code}'`;
      }

      throw e;
    }
  };

  if (isExecLocked) {
    _logger.default.debug('Waiting until the other exclusive ADB command is completed');

    await (0, _asyncbox.waitForCondition)(() => !isExecLocked, {
      waitMs: Number.MAX_SAFE_INTEGER,
      intervalMs: 10
    });

    _logger.default.debug('Continuing with the current ADB command');
  }

  if (opts.exclusive) {
    isExecLocked = true;
  }

  try {
    return await execFunc();
  } finally {
    if (opts.exclusive) {
      isExecLocked = false;
    }
  }
};

systemCallMethods.shell = async function shell(cmd, opts = {}) {
  const {
    privileged,
    keepPrivileged
  } = opts;
  let shouldRestoreUser = false;

  if (privileged) {
    _logger.default.info(`'adb shell ${cmd}' requires root access. Attempting to gain root access now.`);

    const {
      wasAlreadyRooted,
      isSuccessful
    } = await this.root();
    shouldRestoreUser = !wasAlreadyRooted;

    if (wasAlreadyRooted) {
      _logger.default.info('Device already had root access');
    } else {
      _logger.default.info(isSuccessful ? 'Root access successfully gained' : 'Could not gain root access');
    }
  }

  let didCommandFail = false;

  try {
    try {
      return await this.adbExec(_lodash.default.isArray(cmd) ? ['shell', ...cmd] : ['shell', cmd], opts);
    } catch (err) {
      didCommandFail = true;
      throw err;
    }
  } finally {
    if (privileged && shouldRestoreUser && (!keepPrivileged || didCommandFail)) {
      const {
        isSuccessful
      } = await this.unroot();

      _logger.default.debug(isSuccessful ? 'Returned device to unrooted state' : 'Could not return device to unrooted state');
    }
  }
};

systemCallMethods.createSubProcess = function createSubProcess(args = []) {
  args = this.executable.defaultArgs.concat(args);

  _logger.default.debug(`Creating ADB subprocess with args: ${JSON.stringify(args)}`);

  return new _teen_process.SubProcess(this.getAdbPath(), args);
};

systemCallMethods.getAdbServerPort = function getAdbServerPort() {
  return this.adbPort;
};

systemCallMethods.getEmulatorPort = async function getEmulatorPort() {
  _logger.default.debug('Getting running emulator port');

  if (this.emulatorPort !== null) {
    return this.emulatorPort;
  }

  try {
    let devices = await this.getConnectedDevices();
    let port = this.getPortFromEmulatorString(devices[0].udid);

    if (port) {
      return port;
    } else {
      throw new Error(`Emulator port not found`);
    }
  } catch (e) {
    throw new Error(`No devices connected. Original error: ${e.message}`);
  }
};

systemCallMethods.getPortFromEmulatorString = function getPortFromEmulatorString(emStr) {
  let portPattern = /emulator-(\d+)/;

  if (portPattern.test(emStr)) {
    return parseInt(portPattern.exec(emStr)[1], 10);
  }

  return false;
};

systemCallMethods.getConnectedEmulators = async function getConnectedEmulators() {
  _logger.default.debug('Getting connected emulators');

  try {
    let devices = await this.getConnectedDevices();
    let emulators = [];

    for (let device of devices) {
      let port = this.getPortFromEmulatorString(device.udid);

      if (port) {
        device.port = port;
        emulators.push(device);
      }
    }

    _logger.default.debug(`${emulators.length} emulator(s) connected`);

    return emulators;
  } catch (e) {
    throw new Error(`Error getting emulators. Original error: ${e.message}`);
  }
};

systemCallMethods.setEmulatorPort = function setEmulatorPort(emPort) {
  this.emulatorPort = emPort;
};

systemCallMethods.setDeviceId = function setDeviceId(deviceId) {
  _logger.default.debug(`Setting device id to ${deviceId}`);

  this.curDeviceId = deviceId;
  let argsHasDevice = this.executable.defaultArgs.indexOf('-s');

  if (argsHasDevice !== -1) {
    this.executable.defaultArgs.splice(argsHasDevice, 2);
  }

  this.executable.defaultArgs.push('-s', deviceId);
};

systemCallMethods.setDevice = function setDevice(deviceObj) {
  let deviceId = deviceObj.udid;
  let emPort = this.getPortFromEmulatorString(deviceId);
  this.setEmulatorPort(emPort);
  this.setDeviceId(deviceId);
};

systemCallMethods.getRunningAVD = async function getRunningAVD(avdName) {
  _logger.default.debug(`Trying to find '${avdName}' emulator`);

  try {
    const emulators = await this.getConnectedEmulators();

    for (const emulator of emulators) {
      this.setEmulatorPort(emulator.port);
      const runningAVDName = await this.sendTelnetCommand('avd name');

      if (_lodash.default.toLower(avdName) === _lodash.default.toLower(runningAVDName)) {
        _logger.default.debug(`Found emulator '${avdName}' on port ${emulator.port}`);

        this.setDeviceId(emulator.udid);
        return emulator;
      }
    }

    _logger.default.debug(`Emulator '${avdName}' not running`);

    return null;
  } catch (e) {
    throw new Error(`Error getting AVD. Original error: ${e.message}`);
  }
};

systemCallMethods.getRunningAVDWithRetry = async function getRunningAVDWithRetry(avdName, timeoutMs = 20000) {
  let runningAvd;

  try {
    await (0, _asyncbox.waitForCondition)(async () => {
      try {
        runningAvd = await this.getRunningAVD(avdName.replace('@', ''));
        return runningAvd;
      } catch (e) {
        _logger.default.debug(e.message);

        return false;
      }
    }, {
      waitMs: timeoutMs,
      intervalMs: 1000
    });
  } catch (e) {
    throw new Error(`Error getting AVD with retry. Original error: ${e.message}`);
  }

  return runningAvd;
};

systemCallMethods.killAllEmulators = async function killAllEmulators() {
  let cmd, args;

  if (_appiumSupport.system.isWindows()) {
    cmd = 'TASKKILL';
    args = ['TASKKILL', '/IM', 'emulator.exe'];
  } else {
    cmd = '/usr/bin/killall';
    args = ['-m', 'emulator*'];
  }

  try {
    await (0, _teen_process.exec)(cmd, args);
  } catch (e) {
    throw new Error(`Error killing emulators. Original error: ${e.message}`);
  }
};

systemCallMethods.killEmulator = async function killEmulator(avdName = null, timeout = 60000) {
  if (_appiumSupport.util.hasValue(avdName)) {
    _logger.default.debug(`Killing avd '${avdName}'`);

    const device = await this.getRunningAVD(avdName);

    if (!device) {
      _logger.default.info(`No avd with name '${avdName}' running. Skipping kill step.`);

      return false;
    }
  } else {
    _logger.default.debug(`Killing avd with id '${this.curDeviceId}'`);

    if (!(await this.isEmulatorConnected())) {
      _logger.default.debug(`Emulator with id '${this.curDeviceId}' not connected. Skipping kill step`);

      return false;
    }
  }

  await this.adbExec(['emu', 'kill']);

  _logger.default.debug(`Waiting up to ${timeout}ms until the emulator '${avdName ? avdName : this.curDeviceId}' is killed`);

  try {
    await (0, _asyncbox.waitForCondition)(async () => {
      try {
        return _appiumSupport.util.hasValue(avdName) ? !(await this.getRunningAVD(avdName)) : !(await this.isEmulatorConnected());
      } catch (ign) {}

      return false;
    }, {
      waitMs: timeout,
      intervalMs: 2000
    });
  } catch (e) {
    throw new Error(`The emulator '${avdName ? avdName : this.curDeviceId}' is still running after being killed ${timeout}ms ago`);
  }

  _logger.default.info(`Successfully killed the '${avdName ? avdName : this.curDeviceId}' emulator`);

  return true;
};

systemCallMethods.launchAVD = async function launchAVD(avdName, avdArgs, language, country, avdLaunchTimeout = 60000, avdReadyTimeout = 60000, retryTimes = 1) {
  _logger.default.debug(`Launching Emulator with AVD ${avdName}, launchTimeout ` + `${avdLaunchTimeout}ms and readyTimeout ${avdReadyTimeout}ms`);

  let emulatorBinaryPath = await this.getSdkBinaryPath('emulator');

  if (avdName[0] === '@') {
    avdName = avdName.substr(1);
  }

  await this.checkAvdExist(avdName);
  let launchArgs = ['-avd', avdName];

  if (_lodash.default.isString(language)) {
    _logger.default.debug(`Setting Android Device Language to ${language}`);

    launchArgs.push('-prop', `persist.sys.language=${language.toLowerCase()}`);
  }

  if (_lodash.default.isString(country)) {
    _logger.default.debug(`Setting Android Device Country to ${country}`);

    launchArgs.push('-prop', `persist.sys.country=${country.toUpperCase()}`);
  }

  let locale;

  if (_lodash.default.isString(language) && _lodash.default.isString(country)) {
    locale = language.toLowerCase() + '-' + country.toUpperCase();
  } else if (_lodash.default.isString(language)) {
    locale = language.toLowerCase();
  } else if (_lodash.default.isString(country)) {
    locale = country;
  }

  if (_lodash.default.isString(locale)) {
    _logger.default.debug(`Setting Android Device Locale to ${locale}`);

    launchArgs.push('-prop', `persist.sys.locale=${locale}`);
  }

  if (!_lodash.default.isEmpty(avdArgs)) {
    launchArgs.push(...(_lodash.default.isArray(avdArgs) ? avdArgs : avdArgs.split(' ')));
  }

  _logger.default.debug(`Running '${emulatorBinaryPath}' with args: ${JSON.stringify(launchArgs)}`);

  let proc = new _teen_process.SubProcess(emulatorBinaryPath, launchArgs);
  await proc.start(0);
  proc.on('output', (stdout, stderr) => {
    for (let line of (stdout || stderr || '').split('\n').filter(Boolean)) {
      _logger.default.info(`[AVD OUTPUT] ${line}`);
    }
  });
  proc.on('die', (code, signal) => {
    _logger.default.warn(`Emulator avd ${avdName} exited with code ${code}${signal ? `, signal ${signal}` : ''}`);
  });
  await (0, _asyncbox.retry)(retryTimes, async () => await this.getRunningAVDWithRetry(avdName, avdLaunchTimeout));
  await this.waitForEmulatorReady(avdReadyTimeout);
  return proc;
};

systemCallMethods.getAdbVersion = _lodash.default.memoize(async function getAdbVersion() {
  try {
    let adbVersion = (await this.adbExec('version')).replace(/Android\sDebug\sBridge\sversion\s([\d.]*)[\s\w-]*/, '$1');
    let parts = adbVersion.split('.');
    return {
      versionString: adbVersion,
      versionFloat: parseFloat(adbVersion),
      major: parseInt(parts[0], 10),
      minor: parseInt(parts[1], 10),
      patch: parts[2] ? parseInt(parts[2], 10) : undefined
    };
  } catch (e) {
    throw new Error(`Error getting adb version. Original error: '${e.message}'; ` + `Stderr: '${(e.stderr || '').trim()}'; Code: '${e.code}'`);
  }
});

systemCallMethods.checkAvdExist = async function checkAvdExist(avdName) {
  let cmd, result;

  try {
    cmd = await this.getSdkBinaryPath('emulator');
    result = await (0, _teen_process.exec)(cmd, ['-list-avds']);
  } catch (e) {
    let unknownOptionError = new RegExp('unknown option: -list-avds', 'i').test(e.stderr);

    if (!unknownOptionError) {
      throw new Error(`Error executing checkAvdExist. Original error: '${e.message}'; ` + `Stderr: '${(e.stderr || '').trim()}'; Code: '${e.code}'`);
    }

    const sdkVersion = await (0, _helpers.getSdkToolsVersion)();
    let binaryName = 'android';

    if (sdkVersion) {
      if (sdkVersion.major >= 25) {
        binaryName = 'avdmanager';
      }
    } else {
      _logger.default.warn(`Defaulting binary name to '${binaryName}', because SDK version cannot be parsed`);
    }

    cmd = await this.getSdkBinaryPath(binaryName);
    result = await (0, _teen_process.exec)(cmd, ['list', 'avd', '-c']);
  }

  if (result.stdout.indexOf(avdName) === -1) {
    let existings = `(${result.stdout.trim().replace(/[\n]/g, '), (')})`;
    throw new Error(`Avd '${avdName}' is not available. please select your avd name from one of these: '${existings}'`);
  }
};

systemCallMethods.waitForEmulatorReady = async function waitForEmulatorReady(timeoutMs = 20000) {
  try {
    await (0, _asyncbox.waitForCondition)(async () => {
      try {
        if (!(await this.shell(['getprop', 'init.svc.bootanim'])).includes('stopped')) {
          return false;
        }

        return /\d+\[\w+\]/.test((await this.shell(['pm', 'get-install-location'])));
      } catch (err) {
        _logger.default.debug(`Waiting for emulator startup. Intermediate error: ${err.message}`);

        return false;
      }
    }, {
      waitMs: timeoutMs,
      intervalMs: 3000
    });
  } catch (e) {
    throw new Error(`Emulator is not ready within ${timeoutMs}ms`);
  }
};

systemCallMethods.waitForDevice = async function waitForDevice(appDeviceReadyTimeout = 30) {
  this.appDeviceReadyTimeout = appDeviceReadyTimeout;
  const retries = 3;
  const timeout = parseInt(this.appDeviceReadyTimeout, 10) / retries * 1000;
  await (0, _asyncbox.retry)(retries, async () => {
    try {
      await this.adbExec('wait-for-device', {
        timeout
      });
      await this.ping();
    } catch (e) {
      await this.restartAdb();
      await this.getConnectedDevices();
      throw new Error(`Error waiting for the device to be available. Original error: '${e.message}'`);
    }
  });
};

systemCallMethods.reboot = async function reboot(retries = DEFAULT_ADB_REBOOT_RETRIES) {
  const {
    wasAlreadyRooted
  } = await this.root();

  try {
    await this.shell(['stop']);
    await _bluebird.default.delay(2000);
    await this.setDeviceProperty('sys.boot_completed', 0, {
      privileged: false
    });
    await this.shell(['start']);
  } catch (e) {
    const {
      message
    } = e;

    if (message.includes('must be root')) {
      throw new Error(`Could not reboot device. Rebooting requires root access and ` + `attempt to get root access on device failed with error: '${message}'`);
    }

    throw e;
  } finally {
    if (!wasAlreadyRooted) {
      await this.unroot();
    }
  }

  const started = process.hrtime();
  await (0, _asyncbox.retryInterval)(retries, 1000, async () => {
    if ((await this.getDeviceProperty('sys.boot_completed')) === '1') {
      return;
    }

    const msg = `Reboot is not completed after ${process.hrtime(started)[0]}s`;

    _logger.default.debug(msg);

    throw new Error(msg);
  });
};

systemCallMethods.changeUserPrivileges = async function changeUserPrivileges(isElevated) {
  const cmd = isElevated ? 'root' : 'unroot';
  const isRoot = await this.isRoot();

  if (isRoot && isElevated || !isRoot && !isElevated) {
    return {
      isSuccessful: true,
      wasAlreadyRooted: isRoot
    };
  }

  let wasAlreadyRooted = isRoot;

  try {
    let {
      stdout
    } = await this.adbExec([cmd]);

    if (stdout) {
      if (stdout.includes('adbd cannot run as root')) {
        return {
          isSuccessful: false,
          wasAlreadyRooted
        };
      }

      if (stdout.includes('already running as root')) {
        wasAlreadyRooted = true;
      }
    }

    return {
      isSuccessful: true,
      wasAlreadyRooted
    };
  } catch (err) {
    const {
      stderr = '',
      message
    } = err;

    _logger.default.warn(`Unable to ${cmd} adb daemon. Original error: '${message}'. Stderr: '${stderr}'. Continuing.`);

    if (['closed', 'device offline', 'timeout expired'].some(x => stderr.toLowerCase().includes(x))) {
      _logger.default.warn(`Attempt to 'adb ${cmd}' caused device to go offline. Restarting adb.`);

      await this.restartAdb();
    }

    return {
      isSuccessful: false,
      wasAlreadyRooted
    };
  }
};

systemCallMethods.root = async function root() {
  return await this.changeUserPrivileges(true);
};

systemCallMethods.unroot = async function unroot() {
  return await this.changeUserPrivileges(false);
};

systemCallMethods.isRoot = async function isRoot() {
  return (await this.shell(['whoami'])).trim() === 'root';
};

systemCallMethods.fileExists = async function fileExists(remotePath) {
  let files = await this.ls(remotePath);
  return files.length > 0;
};

systemCallMethods.ls = async function ls(remotePath, opts = []) {
  try {
    let args = ['ls', ...opts, remotePath];
    let stdout = await this.shell(args);
    let lines = stdout.split('\n');
    return lines.map(l => l.trim()).filter(Boolean).filter(l => l.indexOf('No such file') === -1);
  } catch (err) {
    if (err.message.indexOf('No such file or directory') === -1) {
      throw err;
    }

    return [];
  }
};

systemCallMethods.fileSize = async function fileSize(remotePath) {
  try {
    const files = await this.ls(remotePath, ['-la']);

    if (files.length !== 1) {
      throw new Error(`Remote path is not a file`);
    }

    const match = /[rwxsStT\-+]{10}[\s\d]*\s[^\s]+\s+[^\s]+\s+(\d+)/.exec(files[0]);

    if (!match || _lodash.default.isNaN(parseInt(match[1], 10))) {
      throw new Error(`Unable to parse size from list output: '${files[0]}'`);
    }

    return parseInt(match[1], 10);
  } catch (err) {
    throw new Error(`Unable to get file size for '${remotePath}': ${err.message}`);
  }
};

systemCallMethods.installMitmCertificate = async function installMitmCertificate(cert) {
  const openSsl = await (0, _helpers.getOpenSslForOs)();

  if (!_lodash.default.isBuffer(cert)) {
    cert = Buffer.from(cert, 'base64');
  }

  const tmpRoot = await _appiumSupport.tempDir.openDir();

  try {
    const srcCert = _path.default.resolve(tmpRoot, 'source.cer');

    await _appiumSupport.fs.writeFile(srcCert, cert);
    let {
      stdout
    } = await (0, _teen_process.exec)(openSsl, ['x509', '-noout', '-hash', '-in', srcCert]);
    const certHash = stdout.trim();

    _logger.default.debug(`Got certificate hash: ${certHash}`);

    _logger.default.debug('Preparing certificate content');

    ({
      stdout
    } = await (0, _teen_process.exec)(openSsl, ['x509', '-in', srcCert], {
      isBuffer: true
    }));
    let dstCertContent = stdout;
    ({
      stdout
    } = await (0, _teen_process.exec)(openSsl, ['x509', '-in', srcCert, '-text', '-fingerprint', '-noout'], {
      isBuffer: true
    }));
    dstCertContent = Buffer.concat([dstCertContent, stdout]);

    const dstCert = _path.default.resolve(tmpRoot, `${certHash}.0`);

    await _appiumSupport.fs.writeFile(dstCert, dstCertContent);

    _logger.default.debug('Remounting /system in rw mode');

    await (0, _asyncbox.retryInterval)(5, 2000, async () => await this.adbExec(['remount']));

    _logger.default.debug(`Uploading the generated certificate from '${dstCert}' to '${CERTS_ROOT}'`);

    await this.push(dstCert, CERTS_ROOT);

    _logger.default.debug('Remounting /system to confirm changes');

    await this.adbExec(['remount']);
  } catch (err) {
    throw new Error(`Cannot inject the custom certificate. ` + `Is the certificate properly encoded into base64-string? ` + `Do you have root permissions on the device? ` + `Original error: ${err.message}`);
  } finally {
    await _appiumSupport.fs.rimraf(tmpRoot);
  }
};

systemCallMethods.isMitmCertificateInstalled = async function isMitmCertificateInstalled(cert) {
  const openSsl = await (0, _helpers.getOpenSslForOs)();

  if (!_lodash.default.isBuffer(cert)) {
    cert = Buffer.from(cert, 'base64');
  }

  const tmpRoot = await _appiumSupport.tempDir.openDir();
  let certHash;

  try {
    const tmpCert = _path.default.resolve(tmpRoot, 'source.cer');

    await _appiumSupport.fs.writeFile(tmpCert, cert);
    const {
      stdout
    } = await (0, _teen_process.exec)(openSsl, ['x509', '-noout', '-hash', '-in', tmpCert]);
    certHash = stdout.trim();
  } catch (err) {
    throw new Error(`Cannot retrieve the certificate hash. ` + `Is the certificate properly encoded into base64-string? ` + `Original error: ${err.message}`);
  } finally {
    await _appiumSupport.fs.rimraf(tmpRoot);
  }

  const dstPath = _path.default.posix.resolve(CERTS_ROOT, `${certHash}.0`);

  _logger.default.debug(`Checking if the certificate is already installed at '${dstPath}'`);

  return await this.fileExists(dstPath);
};

var _default = systemCallMethods;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi90b29scy9zeXN0ZW0tY2FsbHMuanMiXSwibmFtZXMiOlsic3lzdGVtQ2FsbE1ldGhvZHMiLCJERUZBVUxUX0FEQl9SRUJPT1RfUkVUUklFUyIsIkxJTktFUl9XQVJOSU5HX1JFR0VYUCIsIlBST1RPQ09MX0ZBVUxUX0VSUk9SX1JFR0VYUCIsIlJlZ0V4cCIsIkRFVklDRV9OT1RfRk9VTkRfRVJST1JfUkVHRVhQIiwiREVWSUNFX0NPTk5FQ1RJTkdfRVJST1JfUkVHRVhQIiwiQ0VSVFNfUk9PVCIsImdldFNka0JpbmFyeVBhdGgiLCJiaW5hcnlOYW1lIiwic2RrUm9vdCIsImdldEJpbmFyeUZyb21TZGtSb290IiwibG9nIiwid2FybiIsImdldEJpbmFyeUZyb21QYXRoIiwiZ2V0QmluYXJ5TmFtZUZvck9TIiwiXyIsIm1lbW9pemUiLCJzeXN0ZW0iLCJpc1dpbmRvd3MiLCJpbmNsdWRlcyIsInBhdGgiLCJleHRuYW1lIiwiYmluYXJpZXMiLCJmdWxsQmluYXJ5TmFtZSIsImJpbmFyeUxvY3MiLCJzZXAiLCJtYXAiLCJ4IiwicmVzb2x2ZSIsImJ1aWxkVG9vbHNEaXJzIiwiYnVpbGRUb29sc1ZlcnNpb24iLCJmaWx0ZXIiLCJiYXNlbmFtZSIsImlzRW1wdHkiLCJpbmZvIiwicHVzaCIsImRpciIsImJpbmFyeUxvYyIsImxvYyIsImZzIiwiZXhpc3RzIiwiaXNOdWxsIiwiRXJyb3IiLCJKU09OIiwic3RyaW5naWZ5Iiwid2hpY2giLCJlIiwiZ2V0Q29ubmVjdGVkRGV2aWNlcyIsImRlYnVnIiwic3Rkb3V0IiwiZXhlY3V0YWJsZSIsImRlZmF1bHRBcmdzIiwibWVzc2FnZSIsImxpc3RIZWFkZXIiLCJzdGFydGluZ0luZGV4IiwiaW5kZXhPZiIsInNsaWNlIiwiZXhjbHVkZWRMaW5lcyIsImRldmljZXMiLCJzcGxpdCIsInRyaW0iLCJsaW5lIiwic29tZSIsInJlZHVjZSIsImFjYyIsInVkaWQiLCJzdGF0ZSIsImdldERldmljZXNXaXRoUmV0cnkiLCJ0aW1lb3V0TXMiLCJzdGFydCIsIkRhdGUiLCJub3ciLCJnZXREZXZpY2VzIiwibGVuZ3RoIiwicmVzdGFydEFkYiIsInN1cHByZXNzS2lsbFNlcnZlciIsImtpbGxTZXJ2ZXIiLCJlcnJvciIsImFkYlBvcnQiLCJhZGJFeGVjIiwiZXhjbHVzaXZlIiwicmVzZXRUZWxuZXRBdXRoVG9rZW4iLCJob21lRm9sZGVyUGF0aCIsInByb2Nlc3MiLCJlbnYiLCJwbGF0Zm9ybSIsImRzdFBhdGgiLCJ3cml0ZUZpbGUiLCJhZGJFeGVjRW11IiwiY21kIiwidmVyaWZ5RW11bGF0b3JDb25uZWN0ZWQiLCJpc0V4ZWNMb2NrZWQiLCJvcHRzIiwiY2xvbmVEZWVwIiwidGltZW91dCIsImFkYkV4ZWNUaW1lb3V0IiwiREVGQVVMVF9BREJfRVhFQ19USU1FT1VUIiwidGltZW91dENhcE5hbWUiLCJpc0FycmF5IiwiYWRiUmV0cmllZCIsImV4ZWNGdW5jIiwiYXJncyIsInJlcGxhY2UiLCJlcnJUZXh0Iiwic3RkZXJyIiwicHJvdG9jb2xGYXVsdEVycm9yIiwidGVzdCIsImRldmljZU5vdEZvdW5kRXJyb3IiLCJkZXZpY2VDb25uZWN0aW5nRXJyb3IiLCJjb2RlIiwid2FpdE1zIiwiTnVtYmVyIiwiTUFYX1NBRkVfSU5URUdFUiIsImludGVydmFsTXMiLCJzaGVsbCIsInByaXZpbGVnZWQiLCJrZWVwUHJpdmlsZWdlZCIsInNob3VsZFJlc3RvcmVVc2VyIiwid2FzQWxyZWFkeVJvb3RlZCIsImlzU3VjY2Vzc2Z1bCIsInJvb3QiLCJkaWRDb21tYW5kRmFpbCIsImVyciIsInVucm9vdCIsImNyZWF0ZVN1YlByb2Nlc3MiLCJjb25jYXQiLCJTdWJQcm9jZXNzIiwiZ2V0QWRiUGF0aCIsImdldEFkYlNlcnZlclBvcnQiLCJnZXRFbXVsYXRvclBvcnQiLCJlbXVsYXRvclBvcnQiLCJwb3J0IiwiZ2V0UG9ydEZyb21FbXVsYXRvclN0cmluZyIsImVtU3RyIiwicG9ydFBhdHRlcm4iLCJwYXJzZUludCIsImV4ZWMiLCJnZXRDb25uZWN0ZWRFbXVsYXRvcnMiLCJlbXVsYXRvcnMiLCJkZXZpY2UiLCJzZXRFbXVsYXRvclBvcnQiLCJlbVBvcnQiLCJzZXREZXZpY2VJZCIsImRldmljZUlkIiwiY3VyRGV2aWNlSWQiLCJhcmdzSGFzRGV2aWNlIiwic3BsaWNlIiwic2V0RGV2aWNlIiwiZGV2aWNlT2JqIiwiZ2V0UnVubmluZ0FWRCIsImF2ZE5hbWUiLCJlbXVsYXRvciIsInJ1bm5pbmdBVkROYW1lIiwic2VuZFRlbG5ldENvbW1hbmQiLCJ0b0xvd2VyIiwiZ2V0UnVubmluZ0FWRFdpdGhSZXRyeSIsInJ1bm5pbmdBdmQiLCJraWxsQWxsRW11bGF0b3JzIiwia2lsbEVtdWxhdG9yIiwidXRpbCIsImhhc1ZhbHVlIiwiaXNFbXVsYXRvckNvbm5lY3RlZCIsImlnbiIsImxhdW5jaEFWRCIsImF2ZEFyZ3MiLCJsYW5ndWFnZSIsImNvdW50cnkiLCJhdmRMYXVuY2hUaW1lb3V0IiwiYXZkUmVhZHlUaW1lb3V0IiwicmV0cnlUaW1lcyIsImVtdWxhdG9yQmluYXJ5UGF0aCIsInN1YnN0ciIsImNoZWNrQXZkRXhpc3QiLCJsYXVuY2hBcmdzIiwiaXNTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsInRvVXBwZXJDYXNlIiwibG9jYWxlIiwicHJvYyIsIm9uIiwiQm9vbGVhbiIsInNpZ25hbCIsIndhaXRGb3JFbXVsYXRvclJlYWR5IiwiZ2V0QWRiVmVyc2lvbiIsImFkYlZlcnNpb24iLCJwYXJ0cyIsInZlcnNpb25TdHJpbmciLCJ2ZXJzaW9uRmxvYXQiLCJwYXJzZUZsb2F0IiwibWFqb3IiLCJtaW5vciIsInBhdGNoIiwidW5kZWZpbmVkIiwicmVzdWx0IiwidW5rbm93bk9wdGlvbkVycm9yIiwic2RrVmVyc2lvbiIsImV4aXN0aW5ncyIsIndhaXRGb3JEZXZpY2UiLCJhcHBEZXZpY2VSZWFkeVRpbWVvdXQiLCJyZXRyaWVzIiwicGluZyIsInJlYm9vdCIsIkIiLCJkZWxheSIsInNldERldmljZVByb3BlcnR5Iiwic3RhcnRlZCIsImhydGltZSIsImdldERldmljZVByb3BlcnR5IiwibXNnIiwiY2hhbmdlVXNlclByaXZpbGVnZXMiLCJpc0VsZXZhdGVkIiwiaXNSb290IiwiZmlsZUV4aXN0cyIsInJlbW90ZVBhdGgiLCJmaWxlcyIsImxzIiwibGluZXMiLCJsIiwiZmlsZVNpemUiLCJtYXRjaCIsImlzTmFOIiwiaW5zdGFsbE1pdG1DZXJ0aWZpY2F0ZSIsImNlcnQiLCJvcGVuU3NsIiwiaXNCdWZmZXIiLCJCdWZmZXIiLCJmcm9tIiwidG1wUm9vdCIsInRlbXBEaXIiLCJvcGVuRGlyIiwic3JjQ2VydCIsImNlcnRIYXNoIiwiZHN0Q2VydENvbnRlbnQiLCJkc3RDZXJ0IiwicmltcmFmIiwiaXNNaXRtQ2VydGlmaWNhdGVJbnN0YWxsZWQiLCJ0bXBDZXJ0IiwicG9zaXgiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBS0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0EsSUFBSUEsaUJBQWlCLEdBQUcsRUFBeEI7QUFFQSxNQUFNQywwQkFBMEIsR0FBRyxFQUFuQztBQUVBLE1BQU1DLHFCQUFxQixHQUFHLHNCQUE5QjtBQUNBLE1BQU1DLDJCQUEyQixHQUFHLElBQUlDLE1BQUosQ0FBVyxnQ0FBWCxFQUE2QyxHQUE3QyxDQUFwQztBQUNBLE1BQU1DLDZCQUE2QixHQUFHLElBQUlELE1BQUosQ0FBWSxpQ0FBWixFQUE4QyxHQUE5QyxDQUF0QztBQUNBLE1BQU1FLDhCQUE4QixHQUFHLElBQUlGLE1BQUosQ0FBVyxnQ0FBWCxFQUE2QyxHQUE3QyxDQUF2QztBQUVBLE1BQU1HLFVBQVUsR0FBRyw4QkFBbkI7O0FBUUFQLGlCQUFpQixDQUFDUSxnQkFBbEIsR0FBcUMsZUFBZUEsZ0JBQWYsQ0FBaUNDLFVBQWpDLEVBQTZDO0FBQ2hGLE1BQUksS0FBS0MsT0FBVCxFQUFrQjtBQUNoQixXQUFPLE1BQU0sS0FBS0Msb0JBQUwsQ0FBMEJGLFVBQTFCLENBQWI7QUFDRDs7QUFDREcsa0JBQUlDLElBQUosQ0FBVSxzRUFBRCxHQUNOLGtFQURNLEdBRU4seUNBQXdDSixVQUFXLEdBRnREOztBQUdBLFNBQU8sTUFBTSxLQUFLSyxpQkFBTCxDQUF1QkwsVUFBdkIsQ0FBYjtBQUNELENBUkQ7O0FBaUJBVCxpQkFBaUIsQ0FBQ2Usa0JBQWxCLEdBQXVDQyxnQkFBRUMsT0FBRixDQUFVLFNBQVNGLGtCQUFULENBQTZCTixVQUE3QixFQUF5QztBQUN4RixNQUFJLENBQUNTLHNCQUFPQyxTQUFQLEVBQUwsRUFBeUI7QUFDdkIsV0FBT1YsVUFBUDtBQUNEOztBQUVELE1BQUksQ0FBQyxTQUFELEVBQVksV0FBWixFQUF5QixhQUF6QixFQUF3Q1csUUFBeEMsQ0FBaURYLFVBQWpELENBQUosRUFBa0U7QUFDaEUsV0FBUSxHQUFFQSxVQUFXLE1BQXJCO0FBQ0Q7O0FBQ0QsTUFBSSxDQUFDWSxjQUFLQyxPQUFMLENBQWFiLFVBQWIsQ0FBTCxFQUErQjtBQUM3QixXQUFRLEdBQUVBLFVBQVcsTUFBckI7QUFDRDs7QUFDRCxTQUFPQSxVQUFQO0FBQ0QsQ0Fac0MsQ0FBdkM7O0FBMkJBVCxpQkFBaUIsQ0FBQ1csb0JBQWxCLEdBQXlDLGVBQWVBLG9CQUFmLENBQXFDRixVQUFyQyxFQUFpRDtBQUN4RixNQUFJLEtBQUtjLFFBQUwsQ0FBY2QsVUFBZCxDQUFKLEVBQStCO0FBQzdCLFdBQU8sS0FBS2MsUUFBTCxDQUFjZCxVQUFkLENBQVA7QUFDRDs7QUFFRCxRQUFNZSxjQUFjLEdBQUcsS0FBS1Qsa0JBQUwsQ0FBd0JOLFVBQXhCLENBQXZCO0FBQ0EsUUFBTWdCLFVBQVUsR0FBRyxDQUFDLGdCQUFELEVBQW1CLFVBQW5CLEVBQStCLE9BQS9CLEVBQXlDLFFBQU9KLGNBQUtLLEdBQUksS0FBekQsRUFDaEJDLEdBRGdCLENBQ1hDLENBQUQsSUFBT1AsY0FBS1EsT0FBTCxDQUFhLEtBQUtuQixPQUFsQixFQUEyQmtCLENBQTNCLEVBQThCSixjQUE5QixDQURLLENBQW5CO0FBR0EsTUFBSU0sY0FBYyxHQUFHLE1BQU0sZ0NBQWtCLEtBQUtwQixPQUF2QixDQUEzQjs7QUFDQSxNQUFJLEtBQUtxQixpQkFBVCxFQUE0QjtBQUMxQkQsSUFBQUEsY0FBYyxHQUFHQSxjQUFjLENBQzVCRSxNQURjLENBQ05KLENBQUQsSUFBT1AsY0FBS1ksUUFBTCxDQUFjTCxDQUFkLE1BQXFCLEtBQUtHLGlCQUQxQixDQUFqQjs7QUFFQSxRQUFJZixnQkFBRWtCLE9BQUYsQ0FBVUosY0FBVixDQUFKLEVBQStCO0FBQzdCbEIsc0JBQUl1QixJQUFKLENBQVUsa0RBQWlELEtBQUtKLGlCQUFrQixHQUFsRjtBQUNELEtBRkQsTUFFTztBQUNMbkIsc0JBQUl1QixJQUFKLENBQVUseUJBQXdCTCxjQUFlLEdBQWpEO0FBQ0Q7QUFDRjs7QUFDREwsRUFBQUEsVUFBVSxDQUFDVyxJQUFYLENBQWdCLEdBQUlOLGNBQWMsQ0FBQ0gsR0FBZixDQUFvQlUsR0FBRCxJQUFTaEIsY0FBS1EsT0FBTCxDQUFhUSxHQUFiLEVBQWtCYixjQUFsQixDQUE1QixDQUFwQjtBQUVBLE1BQUljLFNBQVMsR0FBRyxJQUFoQjs7QUFDQSxPQUFLLE1BQU1DLEdBQVgsSUFBa0JkLFVBQWxCLEVBQThCO0FBQzVCLFFBQUksTUFBTWUsa0JBQUdDLE1BQUgsQ0FBVUYsR0FBVixDQUFWLEVBQTBCO0FBQ3hCRCxNQUFBQSxTQUFTLEdBQUdDLEdBQVo7QUFDQTtBQUNEO0FBQ0Y7O0FBQ0QsTUFBSXZCLGdCQUFFMEIsTUFBRixDQUFTSixTQUFULENBQUosRUFBeUI7QUFDdkIsVUFBTSxJQUFJSyxLQUFKLENBQVcsbUJBQWtCbkIsY0FBZSxRQUFPb0IsSUFBSSxDQUFDQyxTQUFMLENBQWVwQixVQUFmLENBQTJCLElBQXBFLEdBQ2IsbUNBQWtDLEtBQUtNLGlCQUFMLEdBQTBCLEtBQUksS0FBS0EsaUJBQWtCLEdBQXJELEdBQTBELEVBQUcsRUFEbEYsR0FFYixpQkFBZ0IsS0FBS3JCLE9BQVEsSUFGMUIsQ0FBTjtBQUdEOztBQUNERSxrQkFBSXVCLElBQUosQ0FBVSxVQUFTWCxjQUFlLFdBQVVjLFNBQVUsR0FBdEQ7O0FBQ0EsT0FBS2YsUUFBTCxDQUFjZCxVQUFkLElBQTRCNkIsU0FBNUI7QUFDQSxTQUFPQSxTQUFQO0FBQ0QsQ0FwQ0Q7O0FBOENBdEMsaUJBQWlCLENBQUNjLGlCQUFsQixHQUFzQyxlQUFlQSxpQkFBZixDQUFrQ0wsVUFBbEMsRUFBOEM7QUFDbEYsTUFBSSxLQUFLYyxRQUFMLENBQWNkLFVBQWQsQ0FBSixFQUErQjtBQUM3QixXQUFPLEtBQUtjLFFBQUwsQ0FBY2QsVUFBZCxDQUFQO0FBQ0Q7O0FBRUQsUUFBTWUsY0FBYyxHQUFHLEtBQUtULGtCQUFMLENBQXdCTixVQUF4QixDQUF2Qjs7QUFDQSxNQUFJO0FBQ0YsVUFBTTZCLFNBQVMsR0FBRyxNQUFNRSxrQkFBR00sS0FBSCxDQUFTdEIsY0FBVCxDQUF4Qjs7QUFDQVosb0JBQUl1QixJQUFKLENBQVUsVUFBU1gsY0FBZSxXQUFVYyxTQUFVLEdBQXREOztBQUNBLFNBQUtmLFFBQUwsQ0FBY2QsVUFBZCxJQUE0QjZCLFNBQTVCO0FBQ0EsV0FBT0EsU0FBUDtBQUNELEdBTEQsQ0FLRSxPQUFPUyxDQUFQLEVBQVU7QUFDVixVQUFNLElBQUlKLEtBQUosQ0FBVyxtQkFBa0JuQixjQUFlLHlDQUFsQyxHQUNiLDBGQURHLENBQU47QUFFRDtBQUNGLENBZkQ7O0FBK0JBeEIsaUJBQWlCLENBQUNnRCxtQkFBbEIsR0FBd0MsZUFBZUEsbUJBQWYsR0FBc0M7QUFDNUVwQyxrQkFBSXFDLEtBQUosQ0FBVSw4QkFBVjs7QUFDQSxNQUFJQyxNQUFKOztBQUNBLE1BQUk7QUFDRixLQUFDO0FBQUNBLE1BQUFBO0FBQUQsUUFBVyxNQUFNLHdCQUFLLEtBQUtDLFVBQUwsQ0FBZ0I5QixJQUFyQixFQUEyQixDQUFDLEdBQUcsS0FBSzhCLFVBQUwsQ0FBZ0JDLFdBQXBCLEVBQWlDLFNBQWpDLENBQTNCLENBQWxCO0FBQ0QsR0FGRCxDQUVFLE9BQU9MLENBQVAsRUFBVTtBQUNWLFVBQU0sSUFBSUosS0FBSixDQUFXLDBEQUF5REksQ0FBQyxDQUFDTSxPQUFRLEVBQTlFLENBQU47QUFDRDs7QUFDRCxRQUFNQyxVQUFVLEdBQUcsaUJBQW5CO0FBSUEsUUFBTUMsYUFBYSxHQUFHTCxNQUFNLENBQUNNLE9BQVAsQ0FBZUYsVUFBZixDQUF0Qjs7QUFDQSxNQUFJQyxhQUFhLEdBQUcsQ0FBcEIsRUFBdUI7QUFDckIsVUFBTSxJQUFJWixLQUFKLENBQVcsa0RBQWlETyxNQUFPLEVBQW5FLENBQU47QUFDRDs7QUFFREEsRUFBQUEsTUFBTSxHQUFHQSxNQUFNLENBQUNPLEtBQVAsQ0FBYUYsYUFBYixDQUFUO0FBQ0EsUUFBTUcsYUFBYSxHQUFHLENBQUNKLFVBQUQsRUFBYSxZQUFiLEVBQTJCLFVBQTNCLEVBQXVDLFNBQXZDLENBQXRCO0FBQ0EsUUFBTUssT0FBTyxHQUFHVCxNQUFNLENBQUNVLEtBQVAsQ0FBYSxJQUFiLEVBQ2JqQyxHQURhLENBQ1RYLGdCQUFFNkMsSUFETyxFQUViN0IsTUFGYSxDQUVMOEIsSUFBRCxJQUFVQSxJQUFJLElBQUksQ0FBQ0osYUFBYSxDQUFDSyxJQUFkLENBQW9CbkMsQ0FBRCxJQUFPa0MsSUFBSSxDQUFDMUMsUUFBTCxDQUFjUSxDQUFkLENBQTFCLENBRmIsRUFHYm9DLE1BSGEsQ0FHTixDQUFDQyxHQUFELEVBQU1ILElBQU4sS0FBZTtBQUVyQixVQUFNLENBQUNJLElBQUQsRUFBT0MsS0FBUCxJQUFnQkwsSUFBSSxDQUFDRixLQUFMLENBQVcsS0FBWCxDQUF0QjtBQUNBSyxJQUFBQSxHQUFHLENBQUM3QixJQUFKLENBQVM7QUFBQzhCLE1BQUFBLElBQUQ7QUFBT0MsTUFBQUE7QUFBUCxLQUFUO0FBQ0EsV0FBT0YsR0FBUDtBQUNELEdBUmEsRUFRWCxFQVJXLENBQWhCOztBQVNBLE1BQUlqRCxnQkFBRWtCLE9BQUYsQ0FBVXlCLE9BQVYsQ0FBSixFQUF3QjtBQUN0Qi9DLG9CQUFJcUMsS0FBSixDQUFVLHlDQUFWO0FBQ0QsR0FGRCxNQUVPO0FBQ0xyQyxvQkFBSXFDLEtBQUosQ0FBVyxzQkFBcUJMLElBQUksQ0FBQ0MsU0FBTCxDQUFlYyxPQUFmLENBQXdCLEVBQXhEO0FBQ0Q7O0FBQ0QsU0FBT0EsT0FBUDtBQUNELENBbENEOztBQTRDQTNELGlCQUFpQixDQUFDb0UsbUJBQWxCLEdBQXdDLGVBQWVBLG1CQUFmLENBQW9DQyxTQUFTLEdBQUcsS0FBaEQsRUFBdUQ7QUFDN0YsTUFBSUMsS0FBSyxHQUFHQyxJQUFJLENBQUNDLEdBQUwsRUFBWjs7QUFDQTVELGtCQUFJcUMsS0FBSixDQUFVLDJDQUFWOztBQUNBLE1BQUl3QixVQUFVLEdBQUcsWUFBWTtBQUMzQixRQUFLRixJQUFJLENBQUNDLEdBQUwsS0FBYUYsS0FBZCxHQUF1QkQsU0FBM0IsRUFBc0M7QUFDcEMsWUFBTSxJQUFJMUIsS0FBSixDQUFVLDRDQUFWLENBQU47QUFDRDs7QUFDRCxRQUFJO0FBQ0YsVUFBSWdCLE9BQU8sR0FBRyxNQUFNLEtBQUtYLG1CQUFMLEVBQXBCOztBQUNBLFVBQUlXLE9BQU8sQ0FBQ2UsTUFBUixHQUFpQixDQUFyQixFQUF3QjtBQUN0QjlELHdCQUFJcUMsS0FBSixDQUFVLGtEQUFWOztBQUNBLGNBQU0sS0FBSzBCLFVBQUwsRUFBTjtBQUVBLGNBQU0scUJBQU0sR0FBTixDQUFOO0FBQ0EsZUFBTyxNQUFNRixVQUFVLEVBQXZCO0FBQ0Q7O0FBQ0QsYUFBT2QsT0FBUDtBQUNELEtBVkQsQ0FVRSxPQUFPWixDQUFQLEVBQVU7QUFDVm5DLHNCQUFJcUMsS0FBSixDQUFVLGtEQUFWOztBQUNBLFlBQU0sS0FBSzBCLFVBQUwsRUFBTjtBQUVBLFlBQU0scUJBQU0sR0FBTixDQUFOO0FBQ0EsYUFBTyxNQUFNRixVQUFVLEVBQXZCO0FBQ0Q7QUFDRixHQXJCRDs7QUFzQkEsU0FBTyxNQUFNQSxVQUFVLEVBQXZCO0FBQ0QsQ0ExQkQ7O0FBK0JBekUsaUJBQWlCLENBQUMyRSxVQUFsQixHQUErQixlQUFlQSxVQUFmLEdBQTZCO0FBQzFELE1BQUksS0FBS0Msa0JBQVQsRUFBNkI7QUFDM0JoRSxvQkFBSXFDLEtBQUosQ0FBVyxxREFBWDs7QUFDQTtBQUNEOztBQUVEckMsa0JBQUlxQyxLQUFKLENBQVUsZ0JBQVY7O0FBQ0EsTUFBSTtBQUNGLFVBQU0sS0FBSzRCLFVBQUwsRUFBTjtBQUNELEdBRkQsQ0FFRSxPQUFPOUIsQ0FBUCxFQUFVO0FBQ1ZuQyxvQkFBSWtFLEtBQUosQ0FBVyw4REFBWDtBQUNEO0FBQ0YsQ0FaRDs7QUFpQkE5RSxpQkFBaUIsQ0FBQzZFLFVBQWxCLEdBQStCLGVBQWVBLFVBQWYsR0FBNkI7QUFDMURqRSxrQkFBSXFDLEtBQUosQ0FBVyw4QkFBNkIsS0FBSzhCLE9BQVEsRUFBckQ7O0FBQ0EsUUFBTSxLQUFLQyxPQUFMLENBQWEsQ0FBQyxhQUFELENBQWIsRUFBOEI7QUFDbENDLElBQUFBLFNBQVMsRUFBRTtBQUR1QixHQUE5QixDQUFOO0FBR0QsQ0FMRDs7QUFhQWpGLGlCQUFpQixDQUFDa0Ysb0JBQWxCLEdBQXlDbEUsZ0JBQUVDLE9BQUYsQ0FBVSxlQUFlaUUsb0JBQWYsR0FBdUM7QUFHeEYsUUFBTUMsY0FBYyxHQUFHQyxPQUFPLENBQUNDLEdBQVIsQ0FBYUQsT0FBTyxDQUFDRSxRQUFSLEtBQXFCLE9BQXRCLEdBQWlDLGFBQWpDLEdBQWlELE1BQTdELENBQXZCOztBQUNBLE1BQUksQ0FBQ0gsY0FBTCxFQUFxQjtBQUNuQnZFLG9CQUFJQyxJQUFKLENBQVUsd0dBQVY7O0FBQ0EsV0FBTyxLQUFQO0FBQ0Q7O0FBQ0QsUUFBTTBFLE9BQU8sR0FBR2xFLGNBQUtRLE9BQUwsQ0FBYXNELGNBQWIsRUFBNkIsOEJBQTdCLENBQWhCOztBQUNBdkUsa0JBQUlxQyxLQUFKLENBQVcsY0FBYXNDLE9BQVEsNEVBQWhDOztBQUNBLE1BQUk7QUFDRixVQUFNL0Msa0JBQUdnRCxTQUFILENBQWFELE9BQWIsRUFBc0IsRUFBdEIsQ0FBTjtBQUNELEdBRkQsQ0FFRSxPQUFPeEMsQ0FBUCxFQUFVO0FBQ1ZuQyxvQkFBSUMsSUFBSixDQUFVLFNBQVFrQyxDQUFDLENBQUNNLE9BQVEsbUNBQWtDa0MsT0FBUSxnRUFBdEU7O0FBQ0EsV0FBTyxLQUFQO0FBQ0Q7O0FBQ0QsU0FBTyxJQUFQO0FBQ0QsQ0FqQndDLENBQXpDOztBQXdCQXZGLGlCQUFpQixDQUFDeUYsVUFBbEIsR0FBK0IsZUFBZUEsVUFBZixDQUEyQkMsR0FBM0IsRUFBZ0M7QUFDN0QsUUFBTSxLQUFLQyx1QkFBTCxFQUFOO0FBQ0EsUUFBTSxLQUFLVCxvQkFBTCxFQUFOO0FBQ0EsUUFBTSxLQUFLRixPQUFMLENBQWEsQ0FBQyxLQUFELEVBQVEsR0FBR1UsR0FBWCxDQUFiLENBQU47QUFDRCxDQUpEOztBQU1BLElBQUlFLFlBQVksR0FBRyxLQUFuQjs7QUFnQkE1RixpQkFBaUIsQ0FBQ2dGLE9BQWxCLEdBQTRCLGVBQWVBLE9BQWYsQ0FBd0JVLEdBQXhCLEVBQTZCRyxJQUFJLEdBQUcsRUFBcEMsRUFBd0M7QUFDbEUsTUFBSSxDQUFDSCxHQUFMLEVBQVU7QUFDUixVQUFNLElBQUkvQyxLQUFKLENBQVUsNENBQVYsQ0FBTjtBQUNEOztBQUVEa0QsRUFBQUEsSUFBSSxHQUFHN0UsZ0JBQUU4RSxTQUFGLENBQVlELElBQVosQ0FBUDtBQUVBQSxFQUFBQSxJQUFJLENBQUNFLE9BQUwsR0FBZUYsSUFBSSxDQUFDRSxPQUFMLElBQWdCLEtBQUtDLGNBQXJCLElBQXVDQyxpQ0FBdEQ7QUFDQUosRUFBQUEsSUFBSSxDQUFDSyxjQUFMLEdBQXNCTCxJQUFJLENBQUNLLGNBQUwsSUFBdUIsZ0JBQTdDO0FBRUFSLEVBQUFBLEdBQUcsR0FBRzFFLGdCQUFFbUYsT0FBRixDQUFVVCxHQUFWLElBQWlCQSxHQUFqQixHQUF1QixDQUFDQSxHQUFELENBQTdCO0FBQ0EsTUFBSVUsVUFBVSxHQUFHLEtBQWpCOztBQUNBLFFBQU1DLFFBQVEsR0FBRyxZQUFZO0FBQzNCLFFBQUk7QUFDRixZQUFNQyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEtBQUtuRCxVQUFMLENBQWdCQyxXQUFwQixFQUFpQyxHQUFHc0MsR0FBcEMsQ0FBYjs7QUFDQTlFLHNCQUFJcUMsS0FBSixDQUFXLFlBQVcsS0FBS0UsVUFBTCxDQUFnQjlCLElBQUssSUFBRyx1QkFBTWlGLElBQU4sQ0FBWSxHQUExRDs7QUFDQSxVQUFJO0FBQUNwRCxRQUFBQTtBQUFELFVBQVcsTUFBTSx3QkFBSyxLQUFLQyxVQUFMLENBQWdCOUIsSUFBckIsRUFBMkJpRixJQUEzQixFQUFpQ1QsSUFBakMsQ0FBckI7QUFHQTNDLE1BQUFBLE1BQU0sR0FBR0EsTUFBTSxDQUFDcUQsT0FBUCxDQUFlckcscUJBQWYsRUFBc0MsRUFBdEMsRUFBMEMyRCxJQUExQyxFQUFUO0FBQ0EsYUFBT1gsTUFBUDtBQUNELEtBUkQsQ0FRRSxPQUFPSCxDQUFQLEVBQVU7QUFDVixZQUFNeUQsT0FBTyxHQUFJLEdBQUV6RCxDQUFDLENBQUNNLE9BQVEsS0FBSU4sQ0FBQyxDQUFDRyxNQUFPLEtBQUlILENBQUMsQ0FBQzBELE1BQU8sRUFBdkQ7QUFDQSxZQUFNQyxrQkFBa0IsR0FBR3ZHLDJCQUEyQixDQUFDd0csSUFBNUIsQ0FBaUNILE9BQWpDLENBQTNCO0FBQ0EsWUFBTUksbUJBQW1CLEdBQUd2Ryw2QkFBNkIsQ0FBQ3NHLElBQTlCLENBQW1DSCxPQUFuQyxDQUE1QjtBQUNBLFlBQU1LLHFCQUFxQixHQUFHdkcsOEJBQThCLENBQUNxRyxJQUEvQixDQUFvQ0gsT0FBcEMsQ0FBOUI7O0FBQ0EsVUFBSUUsa0JBQWtCLElBQUlFLG1CQUF0QixJQUE2Q0MscUJBQWpELEVBQXdFO0FBQ3RFakcsd0JBQUl1QixJQUFKLENBQVUsNERBQTJEdUQsR0FBSSxFQUF6RTs7QUFDQSxjQUFNLHFCQUFNLElBQU4sQ0FBTjtBQUNBLGNBQU0sS0FBS3RCLG1CQUFMLEVBQU47O0FBR0EsWUFBSWdDLFVBQUosRUFBZ0I7QUFDZEEsVUFBQUEsVUFBVSxHQUFHLElBQWI7QUFDQSxpQkFBTyxNQUFNQyxRQUFRLEVBQXJCO0FBQ0Q7QUFDRjs7QUFFRCxVQUFJdEQsQ0FBQyxDQUFDK0QsSUFBRixLQUFXLENBQVgsSUFBZ0IvRCxDQUFDLENBQUNHLE1BQXRCLEVBQThCO0FBQzVCLGVBQU9ILENBQUMsQ0FBQ0csTUFBRixDQUFTcUQsT0FBVCxDQUFpQnJHLHFCQUFqQixFQUF3QyxFQUF4QyxFQUE0QzJELElBQTVDLEVBQVA7QUFDRDs7QUFFRCxVQUFJN0MsZ0JBQUUwQixNQUFGLENBQVNLLENBQUMsQ0FBQytELElBQVgsQ0FBSixFQUFzQjtBQUNwQi9ELFFBQUFBLENBQUMsQ0FBQ00sT0FBRixHQUFhLDZDQUE0Q04sQ0FBQyxDQUFDTSxPQUFRLEtBQXZELEdBQ1QsdUJBQXNCd0MsSUFBSSxDQUFDRSxPQUFRLDRDQUEyQ0YsSUFBSSxDQUFDSyxjQUFlLGNBRHJHO0FBRUQsT0FIRCxNQUdPO0FBQ0xuRCxRQUFBQSxDQUFDLENBQUNNLE9BQUYsR0FBYSw2Q0FBNENOLENBQUMsQ0FBQ00sT0FBUSxLQUF2RCxHQUNULFlBQVcsQ0FBQ04sQ0FBQyxDQUFDMEQsTUFBRixJQUFZLEVBQWIsRUFBaUI1QyxJQUFqQixFQUF3QixhQUFZZCxDQUFDLENBQUMrRCxJQUFLLEdBRHpEO0FBRUQ7O0FBQ0QsWUFBTS9ELENBQU47QUFDRDtBQUNGLEdBdkNEOztBQXlDQSxNQUFJNkMsWUFBSixFQUFrQjtBQUNoQmhGLG9CQUFJcUMsS0FBSixDQUFVLDREQUFWOztBQUNBLFVBQU0sZ0NBQWlCLE1BQU0sQ0FBQzJDLFlBQXhCLEVBQXNDO0FBQzFDbUIsTUFBQUEsTUFBTSxFQUFFQyxNQUFNLENBQUNDLGdCQUQyQjtBQUUxQ0MsTUFBQUEsVUFBVSxFQUFFO0FBRjhCLEtBQXRDLENBQU47O0FBSUF0RyxvQkFBSXFDLEtBQUosQ0FBVSx5Q0FBVjtBQUNEOztBQUNELE1BQUk0QyxJQUFJLENBQUNaLFNBQVQsRUFBb0I7QUFDbEJXLElBQUFBLFlBQVksR0FBRyxJQUFmO0FBQ0Q7O0FBQ0QsTUFBSTtBQUNGLFdBQU8sTUFBTVMsUUFBUSxFQUFyQjtBQUNELEdBRkQsU0FFVTtBQUNSLFFBQUlSLElBQUksQ0FBQ1osU0FBVCxFQUFvQjtBQUNsQlcsTUFBQUEsWUFBWSxHQUFHLEtBQWY7QUFDRDtBQUNGO0FBQ0YsQ0F2RUQ7O0FBOEZBNUYsaUJBQWlCLENBQUNtSCxLQUFsQixHQUEwQixlQUFlQSxLQUFmLENBQXNCekIsR0FBdEIsRUFBMkJHLElBQUksR0FBRyxFQUFsQyxFQUFzQztBQUM5RCxRQUFNO0FBQ0p1QixJQUFBQSxVQURJO0FBRUpDLElBQUFBO0FBRkksTUFHRnhCLElBSEo7QUFNQSxNQUFJeUIsaUJBQWlCLEdBQUcsS0FBeEI7O0FBQ0EsTUFBSUYsVUFBSixFQUFnQjtBQUNkeEcsb0JBQUl1QixJQUFKLENBQVUsY0FBYXVELEdBQUksNkRBQTNCOztBQUNBLFVBQU07QUFBQzZCLE1BQUFBLGdCQUFEO0FBQW1CQyxNQUFBQTtBQUFuQixRQUFtQyxNQUFNLEtBQUtDLElBQUwsRUFBL0M7QUFDQUgsSUFBQUEsaUJBQWlCLEdBQUcsQ0FBQ0MsZ0JBQXJCOztBQUNBLFFBQUlBLGdCQUFKLEVBQXNCO0FBQ3BCM0csc0JBQUl1QixJQUFKLENBQVMsZ0NBQVQ7QUFDRCxLQUZELE1BRU87QUFDTHZCLHNCQUFJdUIsSUFBSixDQUFTcUYsWUFBWSxHQUFHLGlDQUFILEdBQXVDLDRCQUE1RDtBQUNEO0FBQ0Y7O0FBQ0QsTUFBSUUsY0FBYyxHQUFHLEtBQXJCOztBQUNBLE1BQUk7QUFDRixRQUFJO0FBQ0YsYUFBTyxNQUFNLEtBQUsxQyxPQUFMLENBQWFoRSxnQkFBRW1GLE9BQUYsQ0FBVVQsR0FBVixJQUFpQixDQUFDLE9BQUQsRUFBVSxHQUFHQSxHQUFiLENBQWpCLEdBQXFDLENBQUMsT0FBRCxFQUFVQSxHQUFWLENBQWxELEVBQWtFRyxJQUFsRSxDQUFiO0FBQ0QsS0FGRCxDQUVFLE9BQU84QixHQUFQLEVBQVk7QUFDWkQsTUFBQUEsY0FBYyxHQUFHLElBQWpCO0FBQ0EsWUFBTUMsR0FBTjtBQUNEO0FBQ0YsR0FQRCxTQU9VO0FBRVIsUUFBSVAsVUFBVSxJQUFJRSxpQkFBZCxLQUFvQyxDQUFDRCxjQUFELElBQW1CSyxjQUF2RCxDQUFKLEVBQTRFO0FBQzFFLFlBQU07QUFBQ0YsUUFBQUE7QUFBRCxVQUFpQixNQUFNLEtBQUtJLE1BQUwsRUFBN0I7O0FBQ0FoSCxzQkFBSXFDLEtBQUosQ0FBVXVFLFlBQVksR0FBRyxtQ0FBSCxHQUF5QywyQ0FBL0Q7QUFDRDtBQUNGO0FBQ0YsQ0FqQ0Q7O0FBbUNBeEgsaUJBQWlCLENBQUM2SCxnQkFBbEIsR0FBcUMsU0FBU0EsZ0JBQVQsQ0FBMkJ2QixJQUFJLEdBQUcsRUFBbEMsRUFBc0M7QUFFekVBLEVBQUFBLElBQUksR0FBRyxLQUFLbkQsVUFBTCxDQUFnQkMsV0FBaEIsQ0FBNEIwRSxNQUE1QixDQUFtQ3hCLElBQW5DLENBQVA7O0FBQ0ExRixrQkFBSXFDLEtBQUosQ0FBVyxzQ0FBcUNMLElBQUksQ0FBQ0MsU0FBTCxDQUFleUQsSUFBZixDQUFxQixFQUFyRTs7QUFDQSxTQUFPLElBQUl5Qix3QkFBSixDQUFlLEtBQUtDLFVBQUwsRUFBZixFQUFrQzFCLElBQWxDLENBQVA7QUFDRCxDQUxEOztBQVlBdEcsaUJBQWlCLENBQUNpSSxnQkFBbEIsR0FBcUMsU0FBU0EsZ0JBQVQsR0FBNkI7QUFDaEUsU0FBTyxLQUFLbEQsT0FBWjtBQUNELENBRkQ7O0FBVUEvRSxpQkFBaUIsQ0FBQ2tJLGVBQWxCLEdBQW9DLGVBQWVBLGVBQWYsR0FBa0M7QUFDcEV0SCxrQkFBSXFDLEtBQUosQ0FBVSwrQkFBVjs7QUFDQSxNQUFJLEtBQUtrRixZQUFMLEtBQXNCLElBQTFCLEVBQWdDO0FBQzlCLFdBQU8sS0FBS0EsWUFBWjtBQUNEOztBQUNELE1BQUk7QUFDRixRQUFJeEUsT0FBTyxHQUFHLE1BQU0sS0FBS1gsbUJBQUwsRUFBcEI7QUFDQSxRQUFJb0YsSUFBSSxHQUFHLEtBQUtDLHlCQUFMLENBQStCMUUsT0FBTyxDQUFDLENBQUQsQ0FBUCxDQUFXTyxJQUExQyxDQUFYOztBQUNBLFFBQUlrRSxJQUFKLEVBQVU7QUFDUixhQUFPQSxJQUFQO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsWUFBTSxJQUFJekYsS0FBSixDQUFXLHlCQUFYLENBQU47QUFDRDtBQUNGLEdBUkQsQ0FRRSxPQUFPSSxDQUFQLEVBQVU7QUFDVixVQUFNLElBQUlKLEtBQUosQ0FBVyx5Q0FBd0NJLENBQUMsQ0FBQ00sT0FBUSxFQUE3RCxDQUFOO0FBQ0Q7QUFDRixDQWhCRDs7QUF5QkFyRCxpQkFBaUIsQ0FBQ3FJLHlCQUFsQixHQUE4QyxTQUFTQSx5QkFBVCxDQUFvQ0MsS0FBcEMsRUFBMkM7QUFDdkYsTUFBSUMsV0FBVyxHQUFHLGdCQUFsQjs7QUFDQSxNQUFJQSxXQUFXLENBQUM1QixJQUFaLENBQWlCMkIsS0FBakIsQ0FBSixFQUE2QjtBQUMzQixXQUFPRSxRQUFRLENBQUNELFdBQVcsQ0FBQ0UsSUFBWixDQUFpQkgsS0FBakIsRUFBd0IsQ0FBeEIsQ0FBRCxFQUE2QixFQUE3QixDQUFmO0FBQ0Q7O0FBQ0QsU0FBTyxLQUFQO0FBQ0QsQ0FORDs7QUFhQXRJLGlCQUFpQixDQUFDMEkscUJBQWxCLEdBQTBDLGVBQWVBLHFCQUFmLEdBQXdDO0FBQ2hGOUgsa0JBQUlxQyxLQUFKLENBQVUsNkJBQVY7O0FBQ0EsTUFBSTtBQUNGLFFBQUlVLE9BQU8sR0FBRyxNQUFNLEtBQUtYLG1CQUFMLEVBQXBCO0FBQ0EsUUFBSTJGLFNBQVMsR0FBRyxFQUFoQjs7QUFDQSxTQUFLLElBQUlDLE1BQVQsSUFBbUJqRixPQUFuQixFQUE0QjtBQUMxQixVQUFJeUUsSUFBSSxHQUFHLEtBQUtDLHlCQUFMLENBQStCTyxNQUFNLENBQUMxRSxJQUF0QyxDQUFYOztBQUNBLFVBQUlrRSxJQUFKLEVBQVU7QUFDUlEsUUFBQUEsTUFBTSxDQUFDUixJQUFQLEdBQWNBLElBQWQ7QUFDQU8sUUFBQUEsU0FBUyxDQUFDdkcsSUFBVixDQUFld0csTUFBZjtBQUNEO0FBQ0Y7O0FBQ0RoSSxvQkFBSXFDLEtBQUosQ0FBVyxHQUFFMEYsU0FBUyxDQUFDakUsTUFBTyx3QkFBOUI7O0FBQ0EsV0FBT2lFLFNBQVA7QUFDRCxHQVpELENBWUUsT0FBTzVGLENBQVAsRUFBVTtBQUNWLFVBQU0sSUFBSUosS0FBSixDQUFXLDRDQUEyQ0ksQ0FBQyxDQUFDTSxPQUFRLEVBQWhFLENBQU47QUFDRDtBQUNGLENBakJEOztBQXdCQXJELGlCQUFpQixDQUFDNkksZUFBbEIsR0FBb0MsU0FBU0EsZUFBVCxDQUEwQkMsTUFBMUIsRUFBa0M7QUFDcEUsT0FBS1gsWUFBTCxHQUFvQlcsTUFBcEI7QUFDRCxDQUZEOztBQVNBOUksaUJBQWlCLENBQUMrSSxXQUFsQixHQUFnQyxTQUFTQSxXQUFULENBQXNCQyxRQUF0QixFQUFnQztBQUM5RHBJLGtCQUFJcUMsS0FBSixDQUFXLHdCQUF1QitGLFFBQVMsRUFBM0M7O0FBQ0EsT0FBS0MsV0FBTCxHQUFtQkQsUUFBbkI7QUFDQSxNQUFJRSxhQUFhLEdBQUcsS0FBSy9GLFVBQUwsQ0FBZ0JDLFdBQWhCLENBQTRCSSxPQUE1QixDQUFvQyxJQUFwQyxDQUFwQjs7QUFDQSxNQUFJMEYsYUFBYSxLQUFLLENBQUMsQ0FBdkIsRUFBMEI7QUFFeEIsU0FBSy9GLFVBQUwsQ0FBZ0JDLFdBQWhCLENBQTRCK0YsTUFBNUIsQ0FBbUNELGFBQW5DLEVBQWtELENBQWxEO0FBQ0Q7O0FBQ0QsT0FBSy9GLFVBQUwsQ0FBZ0JDLFdBQWhCLENBQTRCaEIsSUFBNUIsQ0FBaUMsSUFBakMsRUFBdUM0RyxRQUF2QztBQUNELENBVEQ7O0FBZ0JBaEosaUJBQWlCLENBQUNvSixTQUFsQixHQUE4QixTQUFTQSxTQUFULENBQW9CQyxTQUFwQixFQUErQjtBQUMzRCxNQUFJTCxRQUFRLEdBQUdLLFNBQVMsQ0FBQ25GLElBQXpCO0FBQ0EsTUFBSTRFLE1BQU0sR0FBRyxLQUFLVCx5QkFBTCxDQUErQlcsUUFBL0IsQ0FBYjtBQUNBLE9BQUtILGVBQUwsQ0FBcUJDLE1BQXJCO0FBQ0EsT0FBS0MsV0FBTCxDQUFpQkMsUUFBakI7QUFDRCxDQUxEOztBQWFBaEosaUJBQWlCLENBQUNzSixhQUFsQixHQUFrQyxlQUFlQSxhQUFmLENBQThCQyxPQUE5QixFQUF1QztBQUN2RTNJLGtCQUFJcUMsS0FBSixDQUFXLG1CQUFrQnNHLE9BQVEsWUFBckM7O0FBQ0EsTUFBSTtBQUNGLFVBQU1aLFNBQVMsR0FBRyxNQUFNLEtBQUtELHFCQUFMLEVBQXhCOztBQUNBLFNBQUssTUFBTWMsUUFBWCxJQUF1QmIsU0FBdkIsRUFBa0M7QUFDaEMsV0FBS0UsZUFBTCxDQUFxQlcsUUFBUSxDQUFDcEIsSUFBOUI7QUFDQSxZQUFNcUIsY0FBYyxHQUFHLE1BQU0sS0FBS0MsaUJBQUwsQ0FBdUIsVUFBdkIsQ0FBN0I7O0FBQ0EsVUFBSTFJLGdCQUFFMkksT0FBRixDQUFVSixPQUFWLE1BQXVCdkksZ0JBQUUySSxPQUFGLENBQVVGLGNBQVYsQ0FBM0IsRUFBc0Q7QUFDcEQ3SSx3QkFBSXFDLEtBQUosQ0FBVyxtQkFBa0JzRyxPQUFRLGFBQVlDLFFBQVEsQ0FBQ3BCLElBQUssRUFBL0Q7O0FBQ0EsYUFBS1csV0FBTCxDQUFpQlMsUUFBUSxDQUFDdEYsSUFBMUI7QUFDQSxlQUFPc0YsUUFBUDtBQUNEO0FBQ0Y7O0FBQ0Q1SSxvQkFBSXFDLEtBQUosQ0FBVyxhQUFZc0csT0FBUSxlQUEvQjs7QUFDQSxXQUFPLElBQVA7QUFDRCxHQWJELENBYUUsT0FBT3hHLENBQVAsRUFBVTtBQUNWLFVBQU0sSUFBSUosS0FBSixDQUFXLHNDQUFxQ0ksQ0FBQyxDQUFDTSxPQUFRLEVBQTFELENBQU47QUFDRDtBQUNGLENBbEJEOztBQThCQXJELGlCQUFpQixDQUFDNEosc0JBQWxCLEdBQTJDLGVBQWVBLHNCQUFmLENBQXVDTCxPQUF2QyxFQUFnRGxGLFNBQVMsR0FBRyxLQUE1RCxFQUFtRTtBQUM1RyxNQUFJd0YsVUFBSjs7QUFDQSxNQUFJO0FBQ0YsVUFBTSxnQ0FBaUIsWUFBWTtBQUNqQyxVQUFJO0FBQ0ZBLFFBQUFBLFVBQVUsR0FBRyxNQUFNLEtBQUtQLGFBQUwsQ0FBbUJDLE9BQU8sQ0FBQ2hELE9BQVIsQ0FBZ0IsR0FBaEIsRUFBcUIsRUFBckIsQ0FBbkIsQ0FBbkI7QUFDQSxlQUFPc0QsVUFBUDtBQUNELE9BSEQsQ0FHRSxPQUFPOUcsQ0FBUCxFQUFVO0FBQ1ZuQyx3QkFBSXFDLEtBQUosQ0FBVUYsQ0FBQyxDQUFDTSxPQUFaOztBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0YsS0FSSyxFQVFIO0FBQ0QwRCxNQUFBQSxNQUFNLEVBQUUxQyxTQURQO0FBRUQ2QyxNQUFBQSxVQUFVLEVBQUU7QUFGWCxLQVJHLENBQU47QUFZRCxHQWJELENBYUUsT0FBT25FLENBQVAsRUFBVTtBQUNWLFVBQU0sSUFBSUosS0FBSixDQUFXLGlEQUFnREksQ0FBQyxDQUFDTSxPQUFRLEVBQXJFLENBQU47QUFDRDs7QUFDRCxTQUFPd0csVUFBUDtBQUNELENBbkJEOztBQTBCQTdKLGlCQUFpQixDQUFDOEosZ0JBQWxCLEdBQXFDLGVBQWVBLGdCQUFmLEdBQW1DO0FBQ3RFLE1BQUlwRSxHQUFKLEVBQVNZLElBQVQ7O0FBQ0EsTUFBSXBGLHNCQUFPQyxTQUFQLEVBQUosRUFBd0I7QUFDdEJ1RSxJQUFBQSxHQUFHLEdBQUcsVUFBTjtBQUNBWSxJQUFBQSxJQUFJLEdBQUcsQ0FBQyxVQUFELEVBQWEsS0FBYixFQUFvQixjQUFwQixDQUFQO0FBQ0QsR0FIRCxNQUdPO0FBQ0xaLElBQUFBLEdBQUcsR0FBRyxrQkFBTjtBQUNBWSxJQUFBQSxJQUFJLEdBQUcsQ0FBQyxJQUFELEVBQU8sV0FBUCxDQUFQO0FBQ0Q7O0FBQ0QsTUFBSTtBQUNGLFVBQU0sd0JBQUtaLEdBQUwsRUFBVVksSUFBVixDQUFOO0FBQ0QsR0FGRCxDQUVFLE9BQU92RCxDQUFQLEVBQVU7QUFDVixVQUFNLElBQUlKLEtBQUosQ0FBVyw0Q0FBMkNJLENBQUMsQ0FBQ00sT0FBUSxFQUFoRSxDQUFOO0FBQ0Q7QUFDRixDQWREOztBQTJCQXJELGlCQUFpQixDQUFDK0osWUFBbEIsR0FBaUMsZUFBZUEsWUFBZixDQUE2QlIsT0FBTyxHQUFHLElBQXZDLEVBQTZDeEQsT0FBTyxHQUFHLEtBQXZELEVBQThEO0FBQzdGLE1BQUlpRSxvQkFBS0MsUUFBTCxDQUFjVixPQUFkLENBQUosRUFBNEI7QUFDMUIzSSxvQkFBSXFDLEtBQUosQ0FBVyxnQkFBZXNHLE9BQVEsR0FBbEM7O0FBQ0EsVUFBTVgsTUFBTSxHQUFHLE1BQU0sS0FBS1UsYUFBTCxDQUFtQkMsT0FBbkIsQ0FBckI7O0FBQ0EsUUFBSSxDQUFDWCxNQUFMLEVBQWE7QUFDWGhJLHNCQUFJdUIsSUFBSixDQUFVLHFCQUFvQm9ILE9BQVEsZ0NBQXRDOztBQUNBLGFBQU8sS0FBUDtBQUNEO0FBQ0YsR0FQRCxNQU9PO0FBRUwzSSxvQkFBSXFDLEtBQUosQ0FBVyx3QkFBdUIsS0FBS2dHLFdBQVksR0FBbkQ7O0FBQ0EsUUFBSSxFQUFDLE1BQU0sS0FBS2lCLG1CQUFMLEVBQVAsQ0FBSixFQUF1QztBQUNyQ3RKLHNCQUFJcUMsS0FBSixDQUFXLHFCQUFvQixLQUFLZ0csV0FBWSxxQ0FBaEQ7O0FBQ0EsYUFBTyxLQUFQO0FBQ0Q7QUFDRjs7QUFDRCxRQUFNLEtBQUtqRSxPQUFMLENBQWEsQ0FBQyxLQUFELEVBQVEsTUFBUixDQUFiLENBQU47O0FBQ0FwRSxrQkFBSXFDLEtBQUosQ0FBVyxpQkFBZ0I4QyxPQUFRLDBCQUF5QndELE9BQU8sR0FBR0EsT0FBSCxHQUFhLEtBQUtOLFdBQVksYUFBakc7O0FBQ0EsTUFBSTtBQUNGLFVBQU0sZ0NBQWlCLFlBQVk7QUFDakMsVUFBSTtBQUNGLGVBQU9lLG9CQUFLQyxRQUFMLENBQWNWLE9BQWQsSUFDSCxFQUFDLE1BQU0sS0FBS0QsYUFBTCxDQUFtQkMsT0FBbkIsQ0FBUCxDQURHLEdBRUgsRUFBQyxNQUFNLEtBQUtXLG1CQUFMLEVBQVAsQ0FGSjtBQUdELE9BSkQsQ0FJRSxPQUFPQyxHQUFQLEVBQVksQ0FBRTs7QUFDaEIsYUFBTyxLQUFQO0FBQ0QsS0FQSyxFQU9IO0FBQ0RwRCxNQUFBQSxNQUFNLEVBQUVoQixPQURQO0FBRURtQixNQUFBQSxVQUFVLEVBQUU7QUFGWCxLQVBHLENBQU47QUFXRCxHQVpELENBWUUsT0FBT25FLENBQVAsRUFBVTtBQUNWLFVBQU0sSUFBSUosS0FBSixDQUFXLGlCQUFnQjRHLE9BQU8sR0FBR0EsT0FBSCxHQUFhLEtBQUtOLFdBQVkseUNBQXdDbEQsT0FBUSxRQUFoSCxDQUFOO0FBQ0Q7O0FBQ0RuRixrQkFBSXVCLElBQUosQ0FBVSw0QkFBMkJvSCxPQUFPLEdBQUdBLE9BQUgsR0FBYSxLQUFLTixXQUFZLFlBQTFFOztBQUNBLFNBQU8sSUFBUDtBQUNELENBbkNEOztBQWdEQWpKLGlCQUFpQixDQUFDb0ssU0FBbEIsR0FBOEIsZUFBZUEsU0FBZixDQUEwQmIsT0FBMUIsRUFBbUNjLE9BQW5DLEVBQTRDQyxRQUE1QyxFQUFzREMsT0FBdEQsRUFDNUJDLGdCQUFnQixHQUFHLEtBRFMsRUFDRkMsZUFBZSxHQUFHLEtBRGhCLEVBQ3VCQyxVQUFVLEdBQUcsQ0FEcEMsRUFDdUM7QUFDbkU5SixrQkFBSXFDLEtBQUosQ0FBVywrQkFBOEJzRyxPQUFRLGtCQUF2QyxHQUNDLEdBQUVpQixnQkFBaUIsdUJBQXNCQyxlQUFnQixJQURwRTs7QUFFQSxNQUFJRSxrQkFBa0IsR0FBRyxNQUFNLEtBQUtuSyxnQkFBTCxDQUFzQixVQUF0QixDQUEvQjs7QUFDQSxNQUFJK0ksT0FBTyxDQUFDLENBQUQsQ0FBUCxLQUFlLEdBQW5CLEVBQXdCO0FBQ3RCQSxJQUFBQSxPQUFPLEdBQUdBLE9BQU8sQ0FBQ3FCLE1BQVIsQ0FBZSxDQUFmLENBQVY7QUFDRDs7QUFDRCxRQUFNLEtBQUtDLGFBQUwsQ0FBbUJ0QixPQUFuQixDQUFOO0FBQ0EsTUFBSXVCLFVBQVUsR0FBRyxDQUFDLE1BQUQsRUFBU3ZCLE9BQVQsQ0FBakI7O0FBQ0EsTUFBSXZJLGdCQUFFK0osUUFBRixDQUFXVCxRQUFYLENBQUosRUFBMEI7QUFDeEIxSixvQkFBSXFDLEtBQUosQ0FBVyxzQ0FBcUNxSCxRQUFTLEVBQXpEOztBQUNBUSxJQUFBQSxVQUFVLENBQUMxSSxJQUFYLENBQWdCLE9BQWhCLEVBQTBCLHdCQUF1QmtJLFFBQVEsQ0FBQ1UsV0FBVCxFQUF1QixFQUF4RTtBQUNEOztBQUNELE1BQUloSyxnQkFBRStKLFFBQUYsQ0FBV1IsT0FBWCxDQUFKLEVBQXlCO0FBQ3ZCM0osb0JBQUlxQyxLQUFKLENBQVcscUNBQW9Dc0gsT0FBUSxFQUF2RDs7QUFDQU8sSUFBQUEsVUFBVSxDQUFDMUksSUFBWCxDQUFnQixPQUFoQixFQUEwQix1QkFBc0JtSSxPQUFPLENBQUNVLFdBQVIsRUFBc0IsRUFBdEU7QUFDRDs7QUFDRCxNQUFJQyxNQUFKOztBQUNBLE1BQUlsSyxnQkFBRStKLFFBQUYsQ0FBV1QsUUFBWCxLQUF3QnRKLGdCQUFFK0osUUFBRixDQUFXUixPQUFYLENBQTVCLEVBQWlEO0FBQy9DVyxJQUFBQSxNQUFNLEdBQUdaLFFBQVEsQ0FBQ1UsV0FBVCxLQUF5QixHQUF6QixHQUErQlQsT0FBTyxDQUFDVSxXQUFSLEVBQXhDO0FBQ0QsR0FGRCxNQUVPLElBQUlqSyxnQkFBRStKLFFBQUYsQ0FBV1QsUUFBWCxDQUFKLEVBQTBCO0FBQy9CWSxJQUFBQSxNQUFNLEdBQUdaLFFBQVEsQ0FBQ1UsV0FBVCxFQUFUO0FBQ0QsR0FGTSxNQUVBLElBQUloSyxnQkFBRStKLFFBQUYsQ0FBV1IsT0FBWCxDQUFKLEVBQXlCO0FBQzlCVyxJQUFBQSxNQUFNLEdBQUdYLE9BQVQ7QUFDRDs7QUFDRCxNQUFJdkosZ0JBQUUrSixRQUFGLENBQVdHLE1BQVgsQ0FBSixFQUF3QjtBQUN0QnRLLG9CQUFJcUMsS0FBSixDQUFXLG9DQUFtQ2lJLE1BQU8sRUFBckQ7O0FBQ0FKLElBQUFBLFVBQVUsQ0FBQzFJLElBQVgsQ0FBZ0IsT0FBaEIsRUFBMEIsc0JBQXFCOEksTUFBTyxFQUF0RDtBQUNEOztBQUNELE1BQUksQ0FBQ2xLLGdCQUFFa0IsT0FBRixDQUFVbUksT0FBVixDQUFMLEVBQXlCO0FBQ3ZCUyxJQUFBQSxVQUFVLENBQUMxSSxJQUFYLENBQWdCLElBQUlwQixnQkFBRW1GLE9BQUYsQ0FBVWtFLE9BQVYsSUFBcUJBLE9BQXJCLEdBQStCQSxPQUFPLENBQUN6RyxLQUFSLENBQWMsR0FBZCxDQUFuQyxDQUFoQjtBQUNEOztBQUNEaEQsa0JBQUlxQyxLQUFKLENBQVcsWUFBVzBILGtCQUFtQixnQkFBZS9ILElBQUksQ0FBQ0MsU0FBTCxDQUFlaUksVUFBZixDQUEyQixFQUFuRjs7QUFDQSxNQUFJSyxJQUFJLEdBQUcsSUFBSXBELHdCQUFKLENBQWU0QyxrQkFBZixFQUFtQ0csVUFBbkMsQ0FBWDtBQUNBLFFBQU1LLElBQUksQ0FBQzdHLEtBQUwsQ0FBVyxDQUFYLENBQU47QUFDQTZHLEVBQUFBLElBQUksQ0FBQ0MsRUFBTCxDQUFRLFFBQVIsRUFBa0IsQ0FBQ2xJLE1BQUQsRUFBU3VELE1BQVQsS0FBb0I7QUFDcEMsU0FBSyxJQUFJM0MsSUFBVCxJQUFpQixDQUFDWixNQUFNLElBQUl1RCxNQUFWLElBQW9CLEVBQXJCLEVBQXlCN0MsS0FBekIsQ0FBK0IsSUFBL0IsRUFBcUM1QixNQUFyQyxDQUE0Q3FKLE9BQTVDLENBQWpCLEVBQXVFO0FBQ3JFekssc0JBQUl1QixJQUFKLENBQVUsZ0JBQWUyQixJQUFLLEVBQTlCO0FBQ0Q7QUFDRixHQUpEO0FBS0FxSCxFQUFBQSxJQUFJLENBQUNDLEVBQUwsQ0FBUSxLQUFSLEVBQWUsQ0FBQ3RFLElBQUQsRUFBT3dFLE1BQVAsS0FBa0I7QUFDL0IxSyxvQkFBSUMsSUFBSixDQUFVLGdCQUFlMEksT0FBUSxxQkFBb0J6QyxJQUFLLEdBQUV3RSxNQUFNLEdBQUksWUFBV0EsTUFBTyxFQUF0QixHQUEwQixFQUFHLEVBQS9GO0FBQ0QsR0FGRDtBQUdBLFFBQU0scUJBQU1aLFVBQU4sRUFBa0IsWUFBWSxNQUFNLEtBQUtkLHNCQUFMLENBQTRCTCxPQUE1QixFQUFxQ2lCLGdCQUFyQyxDQUFwQyxDQUFOO0FBQ0EsUUFBTSxLQUFLZSxvQkFBTCxDQUEwQmQsZUFBMUIsQ0FBTjtBQUNBLFNBQU9VLElBQVA7QUFDRCxDQS9DRDs7QUFnRUFuTCxpQkFBaUIsQ0FBQ3dMLGFBQWxCLEdBQWtDeEssZ0JBQUVDLE9BQUYsQ0FBVSxlQUFldUssYUFBZixHQUFnQztBQUMxRSxNQUFJO0FBQ0YsUUFBSUMsVUFBVSxHQUFHLENBQUMsTUFBTSxLQUFLekcsT0FBTCxDQUFhLFNBQWIsQ0FBUCxFQUNkdUIsT0FEYyxDQUNOLG1EQURNLEVBQytDLElBRC9DLENBQWpCO0FBRUEsUUFBSW1GLEtBQUssR0FBR0QsVUFBVSxDQUFDN0gsS0FBWCxDQUFpQixHQUFqQixDQUFaO0FBQ0EsV0FBTztBQUNMK0gsTUFBQUEsYUFBYSxFQUFFRixVQURWO0FBRUxHLE1BQUFBLFlBQVksRUFBRUMsVUFBVSxDQUFDSixVQUFELENBRm5CO0FBR0xLLE1BQUFBLEtBQUssRUFBRXRELFFBQVEsQ0FBQ2tELEtBQUssQ0FBQyxDQUFELENBQU4sRUFBVyxFQUFYLENBSFY7QUFJTEssTUFBQUEsS0FBSyxFQUFFdkQsUUFBUSxDQUFDa0QsS0FBSyxDQUFDLENBQUQsQ0FBTixFQUFXLEVBQVgsQ0FKVjtBQUtMTSxNQUFBQSxLQUFLLEVBQUVOLEtBQUssQ0FBQyxDQUFELENBQUwsR0FBV2xELFFBQVEsQ0FBQ2tELEtBQUssQ0FBQyxDQUFELENBQU4sRUFBVyxFQUFYLENBQW5CLEdBQW9DTztBQUx0QyxLQUFQO0FBT0QsR0FYRCxDQVdFLE9BQU9sSixDQUFQLEVBQVU7QUFDVixVQUFNLElBQUlKLEtBQUosQ0FBVywrQ0FBOENJLENBQUMsQ0FBQ00sT0FBUSxLQUF6RCxHQUNLLFlBQVcsQ0FBQ04sQ0FBQyxDQUFDMEQsTUFBRixJQUFZLEVBQWIsRUFBaUI1QyxJQUFqQixFQUF3QixhQUFZZCxDQUFDLENBQUMrRCxJQUFLLEdBRHJFLENBQU47QUFFRDtBQUNGLENBaEJpQyxDQUFsQzs7QUF3QkE5RyxpQkFBaUIsQ0FBQzZLLGFBQWxCLEdBQWtDLGVBQWVBLGFBQWYsQ0FBOEJ0QixPQUE5QixFQUF1QztBQUN2RSxNQUFJN0QsR0FBSixFQUFTd0csTUFBVDs7QUFDQSxNQUFJO0FBQ0Z4RyxJQUFBQSxHQUFHLEdBQUcsTUFBTSxLQUFLbEYsZ0JBQUwsQ0FBc0IsVUFBdEIsQ0FBWjtBQUNBMEwsSUFBQUEsTUFBTSxHQUFHLE1BQU0sd0JBQUt4RyxHQUFMLEVBQVUsQ0FBQyxZQUFELENBQVYsQ0FBZjtBQUNELEdBSEQsQ0FHRSxPQUFPM0MsQ0FBUCxFQUFVO0FBQ1YsUUFBSW9KLGtCQUFrQixHQUFHLElBQUkvTCxNQUFKLENBQVcsNEJBQVgsRUFBeUMsR0FBekMsRUFBOEN1RyxJQUE5QyxDQUFtRDVELENBQUMsQ0FBQzBELE1BQXJELENBQXpCOztBQUNBLFFBQUksQ0FBQzBGLGtCQUFMLEVBQXlCO0FBQ3ZCLFlBQU0sSUFBSXhKLEtBQUosQ0FBVyxtREFBa0RJLENBQUMsQ0FBQ00sT0FBUSxLQUE3RCxHQUNDLFlBQVcsQ0FBQ04sQ0FBQyxDQUFDMEQsTUFBRixJQUFZLEVBQWIsRUFBaUI1QyxJQUFqQixFQUF3QixhQUFZZCxDQUFDLENBQUMrRCxJQUFLLEdBRGpFLENBQU47QUFHRDs7QUFDRCxVQUFNc0YsVUFBVSxHQUFHLE1BQU0sa0NBQXpCO0FBQ0EsUUFBSTNMLFVBQVUsR0FBRyxTQUFqQjs7QUFDQSxRQUFJMkwsVUFBSixFQUFnQjtBQUNkLFVBQUlBLFVBQVUsQ0FBQ04sS0FBWCxJQUFvQixFQUF4QixFQUE0QjtBQUMxQnJMLFFBQUFBLFVBQVUsR0FBRyxZQUFiO0FBQ0Q7QUFDRixLQUpELE1BSU87QUFDTEcsc0JBQUlDLElBQUosQ0FBVSw4QkFBNkJKLFVBQVcseUNBQWxEO0FBQ0Q7O0FBRURpRixJQUFBQSxHQUFHLEdBQUcsTUFBTSxLQUFLbEYsZ0JBQUwsQ0FBc0JDLFVBQXRCLENBQVo7QUFDQXlMLElBQUFBLE1BQU0sR0FBRyxNQUFNLHdCQUFLeEcsR0FBTCxFQUFVLENBQUMsTUFBRCxFQUFTLEtBQVQsRUFBZ0IsSUFBaEIsQ0FBVixDQUFmO0FBQ0Q7O0FBQ0QsTUFBSXdHLE1BQU0sQ0FBQ2hKLE1BQVAsQ0FBY00sT0FBZCxDQUFzQitGLE9BQXRCLE1BQW1DLENBQUMsQ0FBeEMsRUFBMkM7QUFDekMsUUFBSThDLFNBQVMsR0FBSSxJQUFHSCxNQUFNLENBQUNoSixNQUFQLENBQWNXLElBQWQsR0FBcUIwQyxPQUFyQixDQUE2QixPQUE3QixFQUFzQyxNQUF0QyxDQUE4QyxHQUFsRTtBQUNBLFVBQU0sSUFBSTVELEtBQUosQ0FBVyxRQUFPNEcsT0FBUSx1RUFBc0U4QyxTQUFVLEdBQTFHLENBQU47QUFDRDtBQUNGLENBN0JEOztBQXFDQXJNLGlCQUFpQixDQUFDdUwsb0JBQWxCLEdBQXlDLGVBQWVBLG9CQUFmLENBQXFDbEgsU0FBUyxHQUFHLEtBQWpELEVBQXdEO0FBQy9GLE1BQUk7QUFDRixVQUFNLGdDQUFpQixZQUFZO0FBQ2pDLFVBQUk7QUFDRixZQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUs4QyxLQUFMLENBQVcsQ0FBQyxTQUFELEVBQVksbUJBQVosQ0FBWCxDQUFQLEVBQXFEL0YsUUFBckQsQ0FBOEQsU0FBOUQsQ0FBTCxFQUErRTtBQUM3RSxpQkFBTyxLQUFQO0FBQ0Q7O0FBSUQsZUFBTyxhQUFhdUYsSUFBYixFQUFrQixNQUFNLEtBQUtRLEtBQUwsQ0FBVyxDQUFDLElBQUQsRUFBTyxzQkFBUCxDQUFYLENBQXhCLEVBQVA7QUFDRCxPQVJELENBUUUsT0FBT1EsR0FBUCxFQUFZO0FBQ1ovRyx3QkFBSXFDLEtBQUosQ0FBVyxxREFBb0QwRSxHQUFHLENBQUN0RSxPQUFRLEVBQTNFOztBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0YsS0FiSyxFQWFIO0FBQ0QwRCxNQUFBQSxNQUFNLEVBQUUxQyxTQURQO0FBRUQ2QyxNQUFBQSxVQUFVLEVBQUU7QUFGWCxLQWJHLENBQU47QUFpQkQsR0FsQkQsQ0FrQkUsT0FBT25FLENBQVAsRUFBVTtBQUNWLFVBQU0sSUFBSUosS0FBSixDQUFXLGdDQUErQjBCLFNBQVUsSUFBcEQsQ0FBTjtBQUNEO0FBQ0YsQ0F0QkQ7O0FBOEJBckUsaUJBQWlCLENBQUNzTSxhQUFsQixHQUFrQyxlQUFlQSxhQUFmLENBQThCQyxxQkFBcUIsR0FBRyxFQUF0RCxFQUEwRDtBQUMxRixPQUFLQSxxQkFBTCxHQUE2QkEscUJBQTdCO0FBQ0EsUUFBTUMsT0FBTyxHQUFHLENBQWhCO0FBQ0EsUUFBTXpHLE9BQU8sR0FBR3lDLFFBQVEsQ0FBQyxLQUFLK0QscUJBQU4sRUFBNkIsRUFBN0IsQ0FBUixHQUEyQ0MsT0FBM0MsR0FBcUQsSUFBckU7QUFDQSxRQUFNLHFCQUFNQSxPQUFOLEVBQWUsWUFBWTtBQUMvQixRQUFJO0FBQ0YsWUFBTSxLQUFLeEgsT0FBTCxDQUFhLGlCQUFiLEVBQWdDO0FBQUNlLFFBQUFBO0FBQUQsT0FBaEMsQ0FBTjtBQUNBLFlBQU0sS0FBSzBHLElBQUwsRUFBTjtBQUNELEtBSEQsQ0FHRSxPQUFPMUosQ0FBUCxFQUFVO0FBQ1YsWUFBTSxLQUFLNEIsVUFBTCxFQUFOO0FBQ0EsWUFBTSxLQUFLM0IsbUJBQUwsRUFBTjtBQUNBLFlBQU0sSUFBSUwsS0FBSixDQUFXLGtFQUFpRUksQ0FBQyxDQUFDTSxPQUFRLEdBQXRGLENBQU47QUFDRDtBQUNGLEdBVEssQ0FBTjtBQVVELENBZEQ7O0FBc0JBckQsaUJBQWlCLENBQUMwTSxNQUFsQixHQUEyQixlQUFlQSxNQUFmLENBQXVCRixPQUFPLEdBQUd2TSwwQkFBakMsRUFBNkQ7QUFFdEYsUUFBTTtBQUFFc0gsSUFBQUE7QUFBRixNQUF1QixNQUFNLEtBQUtFLElBQUwsRUFBbkM7O0FBQ0EsTUFBSTtBQUVGLFVBQU0sS0FBS04sS0FBTCxDQUFXLENBQUMsTUFBRCxDQUFYLENBQU47QUFDQSxVQUFNd0Ysa0JBQUVDLEtBQUYsQ0FBUSxJQUFSLENBQU47QUFDQSxVQUFNLEtBQUtDLGlCQUFMLENBQXVCLG9CQUF2QixFQUE2QyxDQUE3QyxFQUFnRDtBQUNwRHpGLE1BQUFBLFVBQVUsRUFBRTtBQUR3QyxLQUFoRCxDQUFOO0FBR0EsVUFBTSxLQUFLRCxLQUFMLENBQVcsQ0FBQyxPQUFELENBQVgsQ0FBTjtBQUNELEdBUkQsQ0FRRSxPQUFPcEUsQ0FBUCxFQUFVO0FBQ1YsVUFBTTtBQUFDTSxNQUFBQTtBQUFELFFBQVlOLENBQWxCOztBQUdBLFFBQUlNLE9BQU8sQ0FBQ2pDLFFBQVIsQ0FBaUIsY0FBakIsQ0FBSixFQUFzQztBQUNwQyxZQUFNLElBQUl1QixLQUFKLENBQVcsOERBQUQsR0FDYiw0REFBMkRVLE9BQVEsR0FEaEUsQ0FBTjtBQUVEOztBQUNELFVBQU1OLENBQU47QUFDRCxHQWpCRCxTQWlCVTtBQUVSLFFBQUksQ0FBQ3dFLGdCQUFMLEVBQXVCO0FBQ3JCLFlBQU0sS0FBS0ssTUFBTCxFQUFOO0FBQ0Q7QUFDRjs7QUFDRCxRQUFNa0YsT0FBTyxHQUFHMUgsT0FBTyxDQUFDMkgsTUFBUixFQUFoQjtBQUNBLFFBQU0sNkJBQWNQLE9BQWQsRUFBdUIsSUFBdkIsRUFBNkIsWUFBWTtBQUM3QyxRQUFJLENBQUMsTUFBTSxLQUFLUSxpQkFBTCxDQUF1QixvQkFBdkIsQ0FBUCxNQUF5RCxHQUE3RCxFQUFrRTtBQUNoRTtBQUNEOztBQUVELFVBQU1DLEdBQUcsR0FBSSxpQ0FBZ0M3SCxPQUFPLENBQUMySCxNQUFSLENBQWVELE9BQWYsRUFBd0IsQ0FBeEIsQ0FBMkIsR0FBeEU7O0FBQ0FsTSxvQkFBSXFDLEtBQUosQ0FBVWdLLEdBQVY7O0FBQ0EsVUFBTSxJQUFJdEssS0FBSixDQUFVc0ssR0FBVixDQUFOO0FBQ0QsR0FSSyxDQUFOO0FBU0QsQ0FwQ0Q7O0FBaURBak4saUJBQWlCLENBQUNrTixvQkFBbEIsR0FBeUMsZUFBZUEsb0JBQWYsQ0FBcUNDLFVBQXJDLEVBQWlEO0FBQ3hGLFFBQU16SCxHQUFHLEdBQUd5SCxVQUFVLEdBQUcsTUFBSCxHQUFZLFFBQWxDO0FBR0EsUUFBTUMsTUFBTSxHQUFHLE1BQU0sS0FBS0EsTUFBTCxFQUFyQjs7QUFDQSxNQUFLQSxNQUFNLElBQUlELFVBQVgsSUFBMkIsQ0FBQ0MsTUFBRCxJQUFXLENBQUNELFVBQTNDLEVBQXdEO0FBQ3RELFdBQU87QUFBQzNGLE1BQUFBLFlBQVksRUFBRSxJQUFmO0FBQXFCRCxNQUFBQSxnQkFBZ0IsRUFBRTZGO0FBQXZDLEtBQVA7QUFDRDs7QUFFRCxNQUFJN0YsZ0JBQWdCLEdBQUc2RixNQUF2Qjs7QUFDQSxNQUFJO0FBQ0YsUUFBSTtBQUFDbEssTUFBQUE7QUFBRCxRQUFXLE1BQU0sS0FBSzhCLE9BQUwsQ0FBYSxDQUFDVSxHQUFELENBQWIsQ0FBckI7O0FBR0EsUUFBSXhDLE1BQUosRUFBWTtBQUNWLFVBQUlBLE1BQU0sQ0FBQzlCLFFBQVAsQ0FBZ0IseUJBQWhCLENBQUosRUFBZ0Q7QUFDOUMsZUFBTztBQUFDb0csVUFBQUEsWUFBWSxFQUFFLEtBQWY7QUFBc0JELFVBQUFBO0FBQXRCLFNBQVA7QUFDRDs7QUFFRCxVQUFJckUsTUFBTSxDQUFDOUIsUUFBUCxDQUFnQix5QkFBaEIsQ0FBSixFQUFnRDtBQUM5Q21HLFFBQUFBLGdCQUFnQixHQUFHLElBQW5CO0FBQ0Q7QUFDRjs7QUFDRCxXQUFPO0FBQUNDLE1BQUFBLFlBQVksRUFBRSxJQUFmO0FBQXFCRCxNQUFBQTtBQUFyQixLQUFQO0FBQ0QsR0FkRCxDQWNFLE9BQU9JLEdBQVAsRUFBWTtBQUNaLFVBQU07QUFBQ2xCLE1BQUFBLE1BQU0sR0FBRyxFQUFWO0FBQWNwRCxNQUFBQTtBQUFkLFFBQXlCc0UsR0FBL0I7O0FBQ0EvRyxvQkFBSUMsSUFBSixDQUFVLGFBQVk2RSxHQUFJLGlDQUFnQ3JDLE9BQVEsZUFBY29ELE1BQU8sZ0JBQXZGOztBQUlBLFFBQUksQ0FBQyxRQUFELEVBQVcsZ0JBQVgsRUFBNkIsaUJBQTdCLEVBQWdEMUMsSUFBaEQsQ0FBc0RuQyxDQUFELElBQU82RSxNQUFNLENBQUN1RSxXQUFQLEdBQXFCNUosUUFBckIsQ0FBOEJRLENBQTlCLENBQTVELENBQUosRUFBbUc7QUFDakdoQixzQkFBSUMsSUFBSixDQUFVLG1CQUFrQjZFLEdBQUksZ0RBQWhDOztBQUNBLFlBQU0sS0FBS2YsVUFBTCxFQUFOO0FBQ0Q7O0FBRUQsV0FBTztBQUFDNkMsTUFBQUEsWUFBWSxFQUFFLEtBQWY7QUFBc0JELE1BQUFBO0FBQXRCLEtBQVA7QUFDRDtBQUNGLENBckNEOztBQTJDQXZILGlCQUFpQixDQUFDeUgsSUFBbEIsR0FBeUIsZUFBZUEsSUFBZixHQUF1QjtBQUM5QyxTQUFPLE1BQU0sS0FBS3lGLG9CQUFMLENBQTBCLElBQTFCLENBQWI7QUFDRCxDQUZEOztBQVNBbE4saUJBQWlCLENBQUM0SCxNQUFsQixHQUEyQixlQUFlQSxNQUFmLEdBQXlCO0FBQ2xELFNBQU8sTUFBTSxLQUFLc0Ysb0JBQUwsQ0FBMEIsS0FBMUIsQ0FBYjtBQUNELENBRkQ7O0FBV0FsTixpQkFBaUIsQ0FBQ29OLE1BQWxCLEdBQTJCLGVBQWVBLE1BQWYsR0FBeUI7QUFDbEQsU0FBTyxDQUFDLE1BQU0sS0FBS2pHLEtBQUwsQ0FBVyxDQUFDLFFBQUQsQ0FBWCxDQUFQLEVBQStCdEQsSUFBL0IsT0FBMEMsTUFBakQ7QUFDRCxDQUZEOztBQVVBN0QsaUJBQWlCLENBQUNxTixVQUFsQixHQUErQixlQUFlQSxVQUFmLENBQTJCQyxVQUEzQixFQUF1QztBQUNwRSxNQUFJQyxLQUFLLEdBQUcsTUFBTSxLQUFLQyxFQUFMLENBQVFGLFVBQVIsQ0FBbEI7QUFDQSxTQUFPQyxLQUFLLENBQUM3SSxNQUFOLEdBQWUsQ0FBdEI7QUFDRCxDQUhEOztBQWNBMUUsaUJBQWlCLENBQUN3TixFQUFsQixHQUF1QixlQUFlQSxFQUFmLENBQW1CRixVQUFuQixFQUErQnpILElBQUksR0FBRyxFQUF0QyxFQUEwQztBQUMvRCxNQUFJO0FBQ0YsUUFBSVMsSUFBSSxHQUFHLENBQUMsSUFBRCxFQUFPLEdBQUdULElBQVYsRUFBZ0J5SCxVQUFoQixDQUFYO0FBQ0EsUUFBSXBLLE1BQU0sR0FBRyxNQUFNLEtBQUtpRSxLQUFMLENBQVdiLElBQVgsQ0FBbkI7QUFDQSxRQUFJbUgsS0FBSyxHQUFHdkssTUFBTSxDQUFDVSxLQUFQLENBQWEsSUFBYixDQUFaO0FBQ0EsV0FBTzZKLEtBQUssQ0FBQzlMLEdBQU4sQ0FBVytMLENBQUQsSUFBT0EsQ0FBQyxDQUFDN0osSUFBRixFQUFqQixFQUNKN0IsTUFESSxDQUNHcUosT0FESCxFQUVKckosTUFGSSxDQUVJMEwsQ0FBRCxJQUFPQSxDQUFDLENBQUNsSyxPQUFGLENBQVUsY0FBVixNQUE4QixDQUFDLENBRnpDLENBQVA7QUFHRCxHQVBELENBT0UsT0FBT21FLEdBQVAsRUFBWTtBQUNaLFFBQUlBLEdBQUcsQ0FBQ3RFLE9BQUosQ0FBWUcsT0FBWixDQUFvQiwyQkFBcEIsTUFBcUQsQ0FBQyxDQUExRCxFQUE2RDtBQUMzRCxZQUFNbUUsR0FBTjtBQUNEOztBQUNELFdBQU8sRUFBUDtBQUNEO0FBQ0YsQ0FkRDs7QUF1QkEzSCxpQkFBaUIsQ0FBQzJOLFFBQWxCLEdBQTZCLGVBQWVBLFFBQWYsQ0FBeUJMLFVBQXpCLEVBQXFDO0FBQ2hFLE1BQUk7QUFDRixVQUFNQyxLQUFLLEdBQUcsTUFBTSxLQUFLQyxFQUFMLENBQVFGLFVBQVIsRUFBb0IsQ0FBQyxLQUFELENBQXBCLENBQXBCOztBQUNBLFFBQUlDLEtBQUssQ0FBQzdJLE1BQU4sS0FBaUIsQ0FBckIsRUFBd0I7QUFDdEIsWUFBTSxJQUFJL0IsS0FBSixDQUFXLDJCQUFYLENBQU47QUFDRDs7QUFFRCxVQUFNaUwsS0FBSyxHQUFHLG1EQUFtRG5GLElBQW5ELENBQXdEOEUsS0FBSyxDQUFDLENBQUQsQ0FBN0QsQ0FBZDs7QUFDQSxRQUFJLENBQUNLLEtBQUQsSUFBVTVNLGdCQUFFNk0sS0FBRixDQUFRckYsUUFBUSxDQUFDb0YsS0FBSyxDQUFDLENBQUQsQ0FBTixFQUFXLEVBQVgsQ0FBaEIsQ0FBZCxFQUErQztBQUM3QyxZQUFNLElBQUlqTCxLQUFKLENBQVcsMkNBQTBDNEssS0FBSyxDQUFDLENBQUQsQ0FBSSxHQUE5RCxDQUFOO0FBQ0Q7O0FBQ0QsV0FBTy9FLFFBQVEsQ0FBQ29GLEtBQUssQ0FBQyxDQUFELENBQU4sRUFBVyxFQUFYLENBQWY7QUFDRCxHQVhELENBV0UsT0FBT2pHLEdBQVAsRUFBWTtBQUNaLFVBQU0sSUFBSWhGLEtBQUosQ0FBVyxnQ0FBK0IySyxVQUFXLE1BQUszRixHQUFHLENBQUN0RSxPQUFRLEVBQXRFLENBQU47QUFDRDtBQUNGLENBZkQ7O0FBK0JBckQsaUJBQWlCLENBQUM4TixzQkFBbEIsR0FBMkMsZUFBZUEsc0JBQWYsQ0FBdUNDLElBQXZDLEVBQTZDO0FBQ3RGLFFBQU1DLE9BQU8sR0FBRyxNQUFNLCtCQUF0Qjs7QUFFQSxNQUFJLENBQUNoTixnQkFBRWlOLFFBQUYsQ0FBV0YsSUFBWCxDQUFMLEVBQXVCO0FBQ3JCQSxJQUFBQSxJQUFJLEdBQUdHLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSixJQUFaLEVBQWtCLFFBQWxCLENBQVA7QUFDRDs7QUFFRCxRQUFNSyxPQUFPLEdBQUcsTUFBTUMsdUJBQVFDLE9BQVIsRUFBdEI7O0FBQ0EsTUFBSTtBQUNGLFVBQU1DLE9BQU8sR0FBR2xOLGNBQUtRLE9BQUwsQ0FBYXVNLE9BQWIsRUFBc0IsWUFBdEIsQ0FBaEI7O0FBQ0EsVUFBTTVMLGtCQUFHZ0QsU0FBSCxDQUFhK0ksT0FBYixFQUFzQlIsSUFBdEIsQ0FBTjtBQUNBLFFBQUk7QUFBQzdLLE1BQUFBO0FBQUQsUUFBVyxNQUFNLHdCQUFLOEssT0FBTCxFQUFjLENBQUMsTUFBRCxFQUFTLFFBQVQsRUFBbUIsT0FBbkIsRUFBNEIsS0FBNUIsRUFBbUNPLE9BQW5DLENBQWQsQ0FBckI7QUFDQSxVQUFNQyxRQUFRLEdBQUd0TCxNQUFNLENBQUNXLElBQVAsRUFBakI7O0FBQ0FqRCxvQkFBSXFDLEtBQUosQ0FBVyx5QkFBd0J1TCxRQUFTLEVBQTVDOztBQUNBNU4sb0JBQUlxQyxLQUFKLENBQVUsK0JBQVY7O0FBQ0EsS0FBQztBQUFDQyxNQUFBQTtBQUFELFFBQVcsTUFBTSx3QkFBSzhLLE9BQUwsRUFBYyxDQUFDLE1BQUQsRUFBUyxLQUFULEVBQWdCTyxPQUFoQixDQUFkLEVBQXdDO0FBQUNOLE1BQUFBLFFBQVEsRUFBRTtBQUFYLEtBQXhDLENBQWxCO0FBQ0EsUUFBSVEsY0FBYyxHQUFHdkwsTUFBckI7QUFDQSxLQUFDO0FBQUNBLE1BQUFBO0FBQUQsUUFBVyxNQUFNLHdCQUFLOEssT0FBTCxFQUFjLENBQUMsTUFBRCxFQUM5QixLQUQ4QixFQUN2Qk8sT0FEdUIsRUFFOUIsT0FGOEIsRUFHOUIsY0FIOEIsRUFJOUIsUUFKOEIsQ0FBZCxFQUlMO0FBQUNOLE1BQUFBLFFBQVEsRUFBRTtBQUFYLEtBSkssQ0FBbEI7QUFLQVEsSUFBQUEsY0FBYyxHQUFHUCxNQUFNLENBQUNwRyxNQUFQLENBQWMsQ0FBQzJHLGNBQUQsRUFBaUJ2TCxNQUFqQixDQUFkLENBQWpCOztBQUNBLFVBQU13TCxPQUFPLEdBQUdyTixjQUFLUSxPQUFMLENBQWF1TSxPQUFiLEVBQXVCLEdBQUVJLFFBQVMsSUFBbEMsQ0FBaEI7O0FBQ0EsVUFBTWhNLGtCQUFHZ0QsU0FBSCxDQUFha0osT0FBYixFQUFzQkQsY0FBdEIsQ0FBTjs7QUFDQTdOLG9CQUFJcUMsS0FBSixDQUFVLCtCQUFWOztBQUVBLFVBQU0sNkJBQWMsQ0FBZCxFQUFpQixJQUFqQixFQUF1QixZQUFZLE1BQU0sS0FBSytCLE9BQUwsQ0FBYSxDQUFDLFNBQUQsQ0FBYixDQUF6QyxDQUFOOztBQUNBcEUsb0JBQUlxQyxLQUFKLENBQVcsNkNBQTRDeUwsT0FBUSxTQUFRbk8sVUFBVyxHQUFsRjs7QUFDQSxVQUFNLEtBQUs2QixJQUFMLENBQVVzTSxPQUFWLEVBQW1Cbk8sVUFBbkIsQ0FBTjs7QUFDQUssb0JBQUlxQyxLQUFKLENBQVUsdUNBQVY7O0FBQ0EsVUFBTSxLQUFLK0IsT0FBTCxDQUFhLENBQUMsU0FBRCxDQUFiLENBQU47QUFDRCxHQXhCRCxDQXdCRSxPQUFPMkMsR0FBUCxFQUFZO0FBQ1osVUFBTSxJQUFJaEYsS0FBSixDQUFXLHdDQUFELEdBQ0MsMERBREQsR0FFQyw4Q0FGRCxHQUdDLG1CQUFrQmdGLEdBQUcsQ0FBQ3RFLE9BQVEsRUFIekMsQ0FBTjtBQUlELEdBN0JELFNBNkJVO0FBQ1IsVUFBTWIsa0JBQUdtTSxNQUFILENBQVVQLE9BQVYsQ0FBTjtBQUNEO0FBQ0YsQ0F4Q0Q7O0FBbURBcE8saUJBQWlCLENBQUM0TywwQkFBbEIsR0FBK0MsZUFBZUEsMEJBQWYsQ0FBMkNiLElBQTNDLEVBQWlEO0FBQzlGLFFBQU1DLE9BQU8sR0FBRyxNQUFNLCtCQUF0Qjs7QUFFQSxNQUFJLENBQUNoTixnQkFBRWlOLFFBQUYsQ0FBV0YsSUFBWCxDQUFMLEVBQXVCO0FBQ3JCQSxJQUFBQSxJQUFJLEdBQUdHLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSixJQUFaLEVBQWtCLFFBQWxCLENBQVA7QUFDRDs7QUFFRCxRQUFNSyxPQUFPLEdBQUcsTUFBTUMsdUJBQVFDLE9BQVIsRUFBdEI7QUFDQSxNQUFJRSxRQUFKOztBQUNBLE1BQUk7QUFDRixVQUFNSyxPQUFPLEdBQUd4TixjQUFLUSxPQUFMLENBQWF1TSxPQUFiLEVBQXNCLFlBQXRCLENBQWhCOztBQUNBLFVBQU01TCxrQkFBR2dELFNBQUgsQ0FBYXFKLE9BQWIsRUFBc0JkLElBQXRCLENBQU47QUFDQSxVQUFNO0FBQUM3SyxNQUFBQTtBQUFELFFBQVcsTUFBTSx3QkFBSzhLLE9BQUwsRUFBYyxDQUFDLE1BQUQsRUFBUyxRQUFULEVBQW1CLE9BQW5CLEVBQTRCLEtBQTVCLEVBQW1DYSxPQUFuQyxDQUFkLENBQXZCO0FBQ0FMLElBQUFBLFFBQVEsR0FBR3RMLE1BQU0sQ0FBQ1csSUFBUCxFQUFYO0FBQ0QsR0FMRCxDQUtFLE9BQU84RCxHQUFQLEVBQVk7QUFDWixVQUFNLElBQUloRixLQUFKLENBQVcsd0NBQUQsR0FDQywwREFERCxHQUVDLG1CQUFrQmdGLEdBQUcsQ0FBQ3RFLE9BQVEsRUFGekMsQ0FBTjtBQUdELEdBVEQsU0FTVTtBQUNSLFVBQU1iLGtCQUFHbU0sTUFBSCxDQUFVUCxPQUFWLENBQU47QUFDRDs7QUFDRCxRQUFNN0ksT0FBTyxHQUFHbEUsY0FBS3lOLEtBQUwsQ0FBV2pOLE9BQVgsQ0FBbUJ0QixVQUFuQixFQUFnQyxHQUFFaU8sUUFBUyxJQUEzQyxDQUFoQjs7QUFDQTVOLGtCQUFJcUMsS0FBSixDQUFXLHdEQUF1RHNDLE9BQVEsR0FBMUU7O0FBQ0EsU0FBTyxNQUFNLEtBQUs4SCxVQUFMLENBQWdCOUgsT0FBaEIsQ0FBYjtBQUNELENBeEJEOztlQTBCZXZGLGlCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgbG9nIGZyb20gJy4uL2xvZ2dlci5qcyc7XG5pbXBvcnQgQiBmcm9tICdibHVlYmlyZCc7XG5pbXBvcnQgeyBzeXN0ZW0sIGZzLCB1dGlsLCB0ZW1wRGlyIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IHtcbiAgZ2V0U2RrVG9vbHNWZXJzaW9uLFxuICBnZXRCdWlsZFRvb2xzRGlycyxcbiAgZ2V0T3BlblNzbEZvck9zLFxuICBERUZBVUxUX0FEQl9FWEVDX1RJTUVPVVQgfSBmcm9tICcuLi9oZWxwZXJzJztcbmltcG9ydCB7IGV4ZWMsIFN1YlByb2Nlc3MgfSBmcm9tICd0ZWVuX3Byb2Nlc3MnO1xuaW1wb3J0IHsgc2xlZXAsIHJldHJ5LCByZXRyeUludGVydmFsLCB3YWl0Rm9yQ29uZGl0aW9uIH0gZnJvbSAnYXN5bmNib3gnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHF1b3RlIH0gZnJvbSAnc2hlbGwtcXVvdGUnO1xuXG5cbmxldCBzeXN0ZW1DYWxsTWV0aG9kcyA9IHt9O1xuXG5jb25zdCBERUZBVUxUX0FEQl9SRUJPT1RfUkVUUklFUyA9IDkwO1xuXG5jb25zdCBMSU5LRVJfV0FSTklOR19SRUdFWFAgPSAvXldBUk5JTkc6IGxpbmtlci4rJC9tO1xuY29uc3QgUFJPVE9DT0xfRkFVTFRfRVJST1JfUkVHRVhQID0gbmV3IFJlZ0V4cCgncHJvdG9jb2wgZmF1bHQgXFxcXChubyBzdGF0dXNcXFxcKScsICdpJyk7XG5jb25zdCBERVZJQ0VfTk9UX0ZPVU5EX0VSUk9SX1JFR0VYUCA9IG5ldyBSZWdFeHAoYGVycm9yOiBkZXZpY2UgKCcuKycgKT9ub3QgZm91bmRgLCAnaScpO1xuY29uc3QgREVWSUNFX0NPTk5FQ1RJTkdfRVJST1JfUkVHRVhQID0gbmV3IFJlZ0V4cCgnZXJyb3I6IGRldmljZSBzdGlsbCBjb25uZWN0aW5nJywgJ2knKTtcblxuY29uc3QgQ0VSVFNfUk9PVCA9ICcvc3lzdGVtL2V0Yy9zZWN1cml0eS9jYWNlcnRzJztcblxuLyoqXG4gKiBSZXRyaWV2ZSBmdWxsIHBhdGggdG8gdGhlIGdpdmVuIGJpbmFyeS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYmluYXJ5TmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBiaW5hcnkuXG4gKiBAcmV0dXJuIHtzdHJpbmd9IEZ1bGwgcGF0aCB0byB0aGUgZ2l2ZW4gYmluYXJ5IGluY2x1ZGluZyBjdXJyZW50IFNESyByb290LlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5nZXRTZGtCaW5hcnlQYXRoID0gYXN5bmMgZnVuY3Rpb24gZ2V0U2RrQmluYXJ5UGF0aCAoYmluYXJ5TmFtZSkge1xuICBpZiAodGhpcy5zZGtSb290KSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0QmluYXJ5RnJvbVNka1Jvb3QoYmluYXJ5TmFtZSk7XG4gIH1cbiAgbG9nLndhcm4oYFRoZSBBTkRST0lEX0hPTUUgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgbm90IHNldCB0byB0aGUgQW5kcm9pZCBTREsgYCArXG4gICAgYHJvb3QgZGlyZWN0b3J5IHBhdGguIEFORFJPSURfSE9NRSBpcyByZXF1aXJlZCBmb3IgY29tcGF0aWJpbGl0eSBgICtcbiAgICBgd2l0aCBTREsgMjMrLiBDaGVja2luZyBhbG9uZyBQQVRIIGZvciAke2JpbmFyeU5hbWV9LmApO1xuICByZXR1cm4gYXdhaXQgdGhpcy5nZXRCaW5hcnlGcm9tUGF0aChiaW5hcnlOYW1lKTtcbn07XG5cbi8qKlxuICogUmV0cmlldmUgZnVsbCBiaW5hcnkgbmFtZSBmb3IgdGhlIGN1cnJlbnQgb3BlcmF0aW5nIHN5c3RlbS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYmluYXJ5TmFtZSAtIHNpbXBsZSBiaW5hcnkgbmFtZSwgZm9yIGV4YW1wbGUgJ2FuZHJvaWQnLlxuICogQHJldHVybiB7c3RyaW5nfSBGb3JtYXR0ZWQgYmluYXJ5IG5hbWUgZGVwZW5kaW5nIG9uIHRoZSBjdXJyZW50IHBsYXRmb3JtLFxuICogICAgICAgICAgICAgICAgICBmb3IgZXhhbXBsZSwgJ2FuZHJvaWQuYmF0JyBvbiBXaW5kb3dzLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5nZXRCaW5hcnlOYW1lRm9yT1MgPSBfLm1lbW9pemUoZnVuY3Rpb24gZ2V0QmluYXJ5TmFtZUZvck9TIChiaW5hcnlOYW1lKSB7XG4gIGlmICghc3lzdGVtLmlzV2luZG93cygpKSB7XG4gICAgcmV0dXJuIGJpbmFyeU5hbWU7XG4gIH1cblxuICBpZiAoWydhbmRyb2lkJywgJ2Fwa3NpZ25lcicsICdhcGthbmFseXplciddLmluY2x1ZGVzKGJpbmFyeU5hbWUpKSB7XG4gICAgcmV0dXJuIGAke2JpbmFyeU5hbWV9LmJhdGA7XG4gIH1cbiAgaWYgKCFwYXRoLmV4dG5hbWUoYmluYXJ5TmFtZSkpIHtcbiAgICByZXR1cm4gYCR7YmluYXJ5TmFtZX0uZXhlYDtcbiAgfVxuICByZXR1cm4gYmluYXJ5TmFtZTtcbn0pO1xuXG4vKipcbiAqIFJldHJpZXZlIGZ1bGwgcGF0aCB0byB0aGUgZ2l2ZW4gYmluYXJ5IGFuZCBjYWNoZXMgaXQgaW50byBgYmluYXJpZXNgXG4gKiBwcm9wZXJ0eSBvZiB0aGUgY3VycmVudCBBREIgaW5zdGFuY2UuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGJpbmFyeU5hbWUgLSBTaW1wbGUgbmFtZSBvZiBhIGJpbmFyeSBmaWxlLlxuICogQHJldHVybiB7c3RyaW5nfSBGdWxsIHBhdGggdG8gdGhlIGdpdmVuIGJpbmFyeS4gVGhlIG1ldGhvZCB0cmllc1xuICogICAgICAgICAgICAgICAgICB0byBlbnVtZXJhdGUgYWxsIHRoZSBrbm93biBsb2NhdGlvbnMgd2hlcmUgdGhlIGJpbmFyeVxuICogICAgICAgICAgICAgICAgICBtaWdodCBiZSBsb2NhdGVkIGFuZCBzdG9wcyB0aGUgc2VhcmNoIGFzIHNvb24gYXMgdGhlIGZpcnN0XG4gKiAgICAgICAgICAgICAgICAgIG1hdGNoIGlzIGZvdW5kIG9uIHRoZSBsb2NhbCBmaWxlIHN5c3RlbS5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGUgYmluYXJ5IHdpdGggZ2l2ZW4gbmFtZSBpcyBub3QgcHJlc2VudCBhdCBhbnlcbiAqICAgICAgICAgICAgICAgICBvZiBrbm93biBsb2NhdGlvbnMgb3IgQW5kcm9pZCBTREsgaXMgbm90IGluc3RhbGxlZCBvbiB0aGVcbiAqICAgICAgICAgICAgICAgICBsb2NhbCBmaWxlIHN5c3RlbS5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuZ2V0QmluYXJ5RnJvbVNka1Jvb3QgPSBhc3luYyBmdW5jdGlvbiBnZXRCaW5hcnlGcm9tU2RrUm9vdCAoYmluYXJ5TmFtZSkge1xuICBpZiAodGhpcy5iaW5hcmllc1tiaW5hcnlOYW1lXSkge1xuICAgIHJldHVybiB0aGlzLmJpbmFyaWVzW2JpbmFyeU5hbWVdO1xuICB9XG5cbiAgY29uc3QgZnVsbEJpbmFyeU5hbWUgPSB0aGlzLmdldEJpbmFyeU5hbWVGb3JPUyhiaW5hcnlOYW1lKTtcbiAgY29uc3QgYmluYXJ5TG9jcyA9IFsncGxhdGZvcm0tdG9vbHMnLCAnZW11bGF0b3InLCAndG9vbHMnLCBgdG9vbHMke3BhdGguc2VwfWJpbmBdXG4gICAgLm1hcCgoeCkgPT4gcGF0aC5yZXNvbHZlKHRoaXMuc2RrUm9vdCwgeCwgZnVsbEJpbmFyeU5hbWUpKTtcbiAgLy8gZ2V0IHN1YnBhdGhzIGZvciBjdXJyZW50bHkgaW5zdGFsbGVkIGJ1aWxkIHRvb2wgZGlyZWN0b3JpZXNcbiAgbGV0IGJ1aWxkVG9vbHNEaXJzID0gYXdhaXQgZ2V0QnVpbGRUb29sc0RpcnModGhpcy5zZGtSb290KTtcbiAgaWYgKHRoaXMuYnVpbGRUb29sc1ZlcnNpb24pIHtcbiAgICBidWlsZFRvb2xzRGlycyA9IGJ1aWxkVG9vbHNEaXJzXG4gICAgICAuZmlsdGVyKCh4KSA9PiBwYXRoLmJhc2VuYW1lKHgpID09PSB0aGlzLmJ1aWxkVG9vbHNWZXJzaW9uKTtcbiAgICBpZiAoXy5pc0VtcHR5KGJ1aWxkVG9vbHNEaXJzKSkge1xuICAgICAgbG9nLmluZm8oYEZvdW5kIG5vIGJ1aWxkIHRvb2xzIHdob3NlIHZlcnNpb24gbWF0Y2hlcyB0byAnJHt0aGlzLmJ1aWxkVG9vbHNWZXJzaW9ufSdgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9nLmluZm8oYFVzaW5nIGJ1aWxkIHRvb2xzIGF0ICcke2J1aWxkVG9vbHNEaXJzfSdgKTtcbiAgICB9XG4gIH1cbiAgYmluYXJ5TG9jcy5wdXNoKC4uLihidWlsZFRvb2xzRGlycy5tYXAoKGRpcikgPT4gcGF0aC5yZXNvbHZlKGRpciwgZnVsbEJpbmFyeU5hbWUpKSkpO1xuXG4gIGxldCBiaW5hcnlMb2MgPSBudWxsO1xuICBmb3IgKGNvbnN0IGxvYyBvZiBiaW5hcnlMb2NzKSB7XG4gICAgaWYgKGF3YWl0IGZzLmV4aXN0cyhsb2MpKSB7XG4gICAgICBiaW5hcnlMb2MgPSBsb2M7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKF8uaXNOdWxsKGJpbmFyeUxvYykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kICcke2Z1bGxCaW5hcnlOYW1lfScgaW4gJHtKU09OLnN0cmluZ2lmeShiaW5hcnlMb2NzKX0uIGAgK1xuICAgICAgYERvIHlvdSBoYXZlIEFuZHJvaWQgQnVpbGQgVG9vbHMgJHt0aGlzLmJ1aWxkVG9vbHNWZXJzaW9uID8gYHYgJHt0aGlzLmJ1aWxkVG9vbHNWZXJzaW9ufSBgIDogJyd9YCArXG4gICAgICBgaW5zdGFsbGVkIGF0ICcke3RoaXMuc2RrUm9vdH0nP2ApO1xuICB9XG4gIGxvZy5pbmZvKGBVc2luZyAnJHtmdWxsQmluYXJ5TmFtZX0nIGZyb20gJyR7YmluYXJ5TG9jfSdgKTtcbiAgdGhpcy5iaW5hcmllc1tiaW5hcnlOYW1lXSA9IGJpbmFyeUxvYztcbiAgcmV0dXJuIGJpbmFyeUxvYztcbn07XG5cbi8qKlxuICogUmV0cmlldmUgZnVsbCBwYXRoIHRvIGEgYmluYXJ5IGZpbGUgdXNpbmcgdGhlIHN0YW5kYXJkIHN5c3RlbSBsb29rdXAgdG9vbC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYmluYXJ5TmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBiaW5hcnkuXG4gKiBAcmV0dXJuIHtzdHJpbmd9IEZ1bGwgcGF0aCB0byB0aGUgYmluYXJ5IHJlY2VpdmVkIGZyb20gJ3doaWNoJy8nd2hlcmUnXG4gKiAgICAgICAgICAgICAgICAgIG91dHB1dC5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiBsb29rdXAgdG9vbCByZXR1cm5zIG5vbi16ZXJvIHJldHVybiBjb2RlLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5nZXRCaW5hcnlGcm9tUGF0aCA9IGFzeW5jIGZ1bmN0aW9uIGdldEJpbmFyeUZyb21QYXRoIChiaW5hcnlOYW1lKSB7XG4gIGlmICh0aGlzLmJpbmFyaWVzW2JpbmFyeU5hbWVdKSB7XG4gICAgcmV0dXJuIHRoaXMuYmluYXJpZXNbYmluYXJ5TmFtZV07XG4gIH1cblxuICBjb25zdCBmdWxsQmluYXJ5TmFtZSA9IHRoaXMuZ2V0QmluYXJ5TmFtZUZvck9TKGJpbmFyeU5hbWUpO1xuICB0cnkge1xuICAgIGNvbnN0IGJpbmFyeUxvYyA9IGF3YWl0IGZzLndoaWNoKGZ1bGxCaW5hcnlOYW1lKTtcbiAgICBsb2cuaW5mbyhgVXNpbmcgJyR7ZnVsbEJpbmFyeU5hbWV9JyBmcm9tICcke2JpbmFyeUxvY30nYCk7XG4gICAgdGhpcy5iaW5hcmllc1tiaW5hcnlOYW1lXSA9IGJpbmFyeUxvYztcbiAgICByZXR1cm4gYmluYXJ5TG9jO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCAnJHtmdWxsQmluYXJ5TmFtZX0nIGluIFBBVEguIFBsZWFzZSBzZXQgdGhlIEFORFJPSURfSE9NRSBgICtcbiAgICAgIGBvciBBTkRST0lEX1NES19ST09UIGVudmlyb25tZW50IHZhcmlhYmxlcyB0byB0aGUgY29yZWN0IEFuZHJvaWQgU0RLIHJvb3QgZGlyZWN0b3J5IHBhdGguYCk7XG4gIH1cbn07XG5cbi8qKlxuICogQHR5cGVkZWYge09iamVjdH0gRGV2aWNlXG4gKiBAcHJvcGVydHkge3N0cmluZ30gdWRpZCAtIFRoZSBkZXZpY2UgdWRpZC5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBzdGF0ZSAtIEN1cnJlbnQgZGV2aWNlIHN0YXRlLCBhcyBpdCBpcyB2aXNpYmxlIGluXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBfYWRiIGRldmljZXMgLWxfIG91dHB1dC5cbiAqL1xuXG4vKipcbiAqIFJldHJpZXZlIHRoZSBsaXN0IG9mIGRldmljZXMgdmlzaWJsZSB0byBhZGIuXG4gKlxuICogQHJldHVybiB7QXJyYXkuPERldmljZT59IFRoZSBsaXN0IG9mIGRldmljZXMgb3IgYW4gZW1wdHkgbGlzdCBpZlxuICogICAgICAgICAgICAgICAgICAgICAgICAgIG5vIGRldmljZXMgYXJlIGNvbm5lY3RlZC5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSB3YXMgYW4gZXJyb3Igd2hpbGUgbGlzdGluZyBkZXZpY2VzLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5nZXRDb25uZWN0ZWREZXZpY2VzID0gYXN5bmMgZnVuY3Rpb24gZ2V0Q29ubmVjdGVkRGV2aWNlcyAoKSB7XG4gIGxvZy5kZWJ1ZygnR2V0dGluZyBjb25uZWN0ZWQgZGV2aWNlcy4uLicpO1xuICBsZXQgc3Rkb3V0O1xuICB0cnkge1xuICAgICh7c3Rkb3V0fSA9IGF3YWl0IGV4ZWModGhpcy5leGVjdXRhYmxlLnBhdGgsIFsuLi50aGlzLmV4ZWN1dGFibGUuZGVmYXVsdEFyZ3MsICdkZXZpY2VzJ10pKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3Igd2hpbGUgZ2V0dGluZyBjb25uZWN0ZWQgZGV2aWNlcy4gT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG4gIGNvbnN0IGxpc3RIZWFkZXIgPSAnTGlzdCBvZiBkZXZpY2VzJztcbiAgLy8gZXhwZWN0aW5nIGFkYiBkZXZpY2VzIHRvIHJldHVybiBvdXRwdXQgYXNcbiAgLy8gTGlzdCBvZiBkZXZpY2VzIGF0dGFjaGVkXG4gIC8vIGVtdWxhdG9yLTU1NTRcdGRldmljZVxuICBjb25zdCBzdGFydGluZ0luZGV4ID0gc3Rkb3V0LmluZGV4T2YobGlzdEhlYWRlcik7XG4gIGlmIChzdGFydGluZ0luZGV4IDwgMCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCBvdXRwdXQgd2hpbGUgdHJ5aW5nIHRvIGdldCBkZXZpY2VzOiAke3N0ZG91dH1gKTtcbiAgfVxuICAvLyBzbGljaW5nIG91dHB1dCB3ZSBjYXJlIGFib3V0XG4gIHN0ZG91dCA9IHN0ZG91dC5zbGljZShzdGFydGluZ0luZGV4KTtcbiAgY29uc3QgZXhjbHVkZWRMaW5lcyA9IFtsaXN0SGVhZGVyLCAnYWRiIHNlcnZlcicsICcqIGRhZW1vbicsICdvZmZsaW5lJ107XG4gIGNvbnN0IGRldmljZXMgPSBzdGRvdXQuc3BsaXQoJ1xcbicpXG4gICAgLm1hcChfLnRyaW0pXG4gICAgLmZpbHRlcigobGluZSkgPT4gbGluZSAmJiAhZXhjbHVkZWRMaW5lcy5zb21lKCh4KSA9PiBsaW5lLmluY2x1ZGVzKHgpKSlcbiAgICAucmVkdWNlKChhY2MsIGxpbmUpID0+IHtcbiAgICAgIC8vIHN0YXRlIGlzIFwiZGV2aWNlXCIsIGFmYWljXG4gICAgICBjb25zdCBbdWRpZCwgc3RhdGVdID0gbGluZS5zcGxpdCgvXFxzKy8pO1xuICAgICAgYWNjLnB1c2goe3VkaWQsIHN0YXRlfSk7XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcbiAgaWYgKF8uaXNFbXB0eShkZXZpY2VzKSkge1xuICAgIGxvZy5kZWJ1ZygnTm8gY29ubmVjdGVkIGRldmljZXMgaGF2ZSBiZWVuIGRldGVjdGVkJyk7XG4gIH0gZWxzZSB7XG4gICAgbG9nLmRlYnVnKGBDb25uZWN0ZWQgZGV2aWNlczogJHtKU09OLnN0cmluZ2lmeShkZXZpY2VzKX1gKTtcbiAgfVxuICByZXR1cm4gZGV2aWNlcztcbn07XG5cbi8qKlxuICogUmV0cmlldmUgdGhlIGxpc3Qgb2YgZGV2aWNlcyB2aXNpYmxlIHRvIGFkYiB3aXRoaW4gdGhlIGdpdmVuIHRpbWVvdXQuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IHRpbWVvdXRNcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gZ2V0IGF0IGxlYXN0XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb25lIGxpc3QgaXRlbS5cbiAqIEByZXR1cm4ge0FycmF5LjxEZXZpY2U+fSBUaGUgbGlzdCBvZiBjb25uZWN0ZWQgZGV2aWNlcy5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiBubyBjb25uZWN0ZWQgZGV2aWNlcyBjYW4gYmUgZGV0ZWN0ZWQgd2l0aGluIHRoZSBnaXZlbiB0aW1lb3V0LlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5nZXREZXZpY2VzV2l0aFJldHJ5ID0gYXN5bmMgZnVuY3Rpb24gZ2V0RGV2aWNlc1dpdGhSZXRyeSAodGltZW91dE1zID0gMjAwMDApIHtcbiAgbGV0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgbG9nLmRlYnVnKCdUcnlpbmcgdG8gZmluZCBhIGNvbm5lY3RlZCBhbmRyb2lkIGRldmljZScpO1xuICBsZXQgZ2V0RGV2aWNlcyA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoKERhdGUubm93KCkgLSBzdGFydCkgPiB0aW1lb3V0TXMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgYSBjb25uZWN0ZWQgQW5kcm9pZCBkZXZpY2UuJyk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBsZXQgZGV2aWNlcyA9IGF3YWl0IHRoaXMuZ2V0Q29ubmVjdGVkRGV2aWNlcygpO1xuICAgICAgaWYgKGRldmljZXMubGVuZ3RoIDwgMSkge1xuICAgICAgICBsb2cuZGVidWcoJ0NvdWxkIG5vdCBmaW5kIGRldmljZXMsIHJlc3RhcnRpbmcgYWRiIHNlcnZlci4uLicpO1xuICAgICAgICBhd2FpdCB0aGlzLnJlc3RhcnRBZGIoKTtcbiAgICAgICAgLy8gY29vbCBkb3duXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XG4gICAgICAgIHJldHVybiBhd2FpdCBnZXREZXZpY2VzKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZGV2aWNlcztcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2cuZGVidWcoJ0NvdWxkIG5vdCBmaW5kIGRldmljZXMsIHJlc3RhcnRpbmcgYWRiIHNlcnZlci4uLicpO1xuICAgICAgYXdhaXQgdGhpcy5yZXN0YXJ0QWRiKCk7XG4gICAgICAvLyBjb29sIGRvd25cbiAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XG4gICAgICByZXR1cm4gYXdhaXQgZ2V0RGV2aWNlcygpO1xuICAgIH1cbiAgfTtcbiAgcmV0dXJuIGF3YWl0IGdldERldmljZXMoKTtcbn07XG5cbi8qKlxuICogUmVzdGFydCBhZGIgc2VydmVyLCB1bmxlc3MgX3RoaXMuc3VwcHJlc3NLaWxsU2VydmVyXyBwcm9wZXJ0eSBpcyB0cnVlLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5yZXN0YXJ0QWRiID0gYXN5bmMgZnVuY3Rpb24gcmVzdGFydEFkYiAoKSB7XG4gIGlmICh0aGlzLnN1cHByZXNzS2lsbFNlcnZlcikge1xuICAgIGxvZy5kZWJ1ZyhgTm90IHJlc3RhcnRpbmcgYWJkIHNpbmNlICdzdXBwcmVzc0tpbGxTZXJ2ZXInIGlzIG9uYCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbG9nLmRlYnVnKCdSZXN0YXJ0aW5nIGFkYicpO1xuICB0cnkge1xuICAgIGF3YWl0IHRoaXMua2lsbFNlcnZlcigpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nLmVycm9yKGBFcnJvciBraWxsaW5nIEFEQiBzZXJ2ZXIsIGdvaW5nIHRvIHNlZSBpZiBpdCdzIG9ubGluZSBhbnl3YXlgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBLaWxsIGFkYiBzZXJ2ZXIuXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmtpbGxTZXJ2ZXIgPSBhc3luYyBmdW5jdGlvbiBraWxsU2VydmVyICgpIHtcbiAgbG9nLmRlYnVnKGBLaWxsaW5nIGFkYiBzZXJ2ZXIgb24gcG9ydCAke3RoaXMuYWRiUG9ydH1gKTtcbiAgYXdhaXQgdGhpcy5hZGJFeGVjKFsna2lsbC1zZXJ2ZXInXSwge1xuICAgIGV4Y2x1c2l2ZTogdHJ1ZSxcbiAgfSk7XG59O1xuXG4vKipcbiAqIFJlc2V0IFRlbG5ldCBhdXRoZW50aWNhdGlvbiB0b2tlbi5cbiAqIEBzZWUge0BsaW5rIGh0dHA6Ly90b29scy5hbmRyb2lkLmNvbS9yZWNlbnQvZW11bGF0b3IyNTE2cmVsZWFzZW5vdGVzfSBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIEByZXR1cm5zIHtib29sZWFufSBJZiB0b2tlbiByZXNldCB3YXMgc3VjY2Vzc2Z1bC5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMucmVzZXRUZWxuZXRBdXRoVG9rZW4gPSBfLm1lbW9pemUoYXN5bmMgZnVuY3Rpb24gcmVzZXRUZWxuZXRBdXRoVG9rZW4gKCkge1xuICAvLyBUaGUgbWV0aG9kcyBpcyB1c2VkIHRvIHJlbW92ZSB0ZWxuZXQgYXV0aCB0b2tlblxuICAvL1xuICBjb25zdCBob21lRm9sZGVyUGF0aCA9IHByb2Nlc3MuZW52Wyhwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSA/ICdVU0VSUFJPRklMRScgOiAnSE9NRSddO1xuICBpZiAoIWhvbWVGb2xkZXJQYXRoKSB7XG4gICAgbG9nLndhcm4oYENhbm5vdCBmaW5kIHRoZSBwYXRoIHRvIHVzZXIgaG9tZSBmb2xkZXIuIElnbm9yaW5nIHJlc2V0dGluZyBvZiBlbXVsYXRvcidzIHRlbG5ldCBhdXRoZW50aWNhdGlvbiB0b2tlbmApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBkc3RQYXRoID0gcGF0aC5yZXNvbHZlKGhvbWVGb2xkZXJQYXRoLCAnLmVtdWxhdG9yX2NvbnNvbGVfYXV0aF90b2tlbicpO1xuICBsb2cuZGVidWcoYE92ZXJyaWRpbmcgJHtkc3RQYXRofSB3aXRoIGFuIGVtcHR5IHN0cmluZyB0byBhdm9pZCB0ZWxuZXQgYXV0aGVudGljYXRpb24gZm9yIGVtdWxhdG9yIGNvbW1hbmRzYCk7XG4gIHRyeSB7XG4gICAgYXdhaXQgZnMud3JpdGVGaWxlKGRzdFBhdGgsICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZy53YXJuKGBFcnJvciAke2UubWVzc2FnZX0gd2hpbGUgcmVzZXR0aW5nIHRoZSBjb250ZW50IG9mICR7ZHN0UGF0aH0uIElnbm9yaW5nIHJlc2V0dGluZyBvZiBlbXVsYXRvcidzIHRlbG5ldCBhdXRoZW50aWNhdGlvbiB0b2tlbmApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn0pO1xuXG4vKipcbiAqIEV4ZWN1dGUgdGhlIGdpdmVuIGVtdWxhdG9yIGNvbW1hbmQgdXNpbmcgX2FkYiBlbXVfIHRvb2wuXG4gKlxuICogQHBhcmFtIHtBcnJheS48c3RyaW5nPn0gY21kIC0gVGhlIGFycmF5IG9mIHJlc3QgY29tbWFuZCBsaW5lIHBhcmFtZXRlcnMuXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmFkYkV4ZWNFbXUgPSBhc3luYyBmdW5jdGlvbiBhZGJFeGVjRW11IChjbWQpIHtcbiAgYXdhaXQgdGhpcy52ZXJpZnlFbXVsYXRvckNvbm5lY3RlZCgpO1xuICBhd2FpdCB0aGlzLnJlc2V0VGVsbmV0QXV0aFRva2VuKCk7XG4gIGF3YWl0IHRoaXMuYWRiRXhlYyhbJ2VtdScsIC4uLmNtZF0pO1xufTtcblxubGV0IGlzRXhlY0xvY2tlZCA9IGZhbHNlO1xuXG4vKipcbiAqIEV4ZWN1dGUgdGhlIGdpdmVuIGFkYiBjb21tYW5kLlxuICpcbiAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz59IGNtZCAtIFRoZSBhcnJheSBvZiByZXN0IGNvbW1hbmQgbGluZSBwYXJhbWV0ZXJzXG4gKiAgICAgICAgICAgICAgICAgICAgICBvciBhIHNpbmdsZSBzdHJpbmcgcGFyYW1ldGVyLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgLSBBZGRpdGlvbmFsIG9wdGlvbnMgbWFwcGluZy4gU2VlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgIHtAbGluayBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL25vZGUtdGVlbl9wcm9jZXNzfVxuICogICAgICAgICAgICAgICAgICAgICAgICBmb3IgbW9yZSBkZXRhaWxzLlxuICogICAgICAgICAgICAgICAgICAgICAgICBZb3UgY2FuIGFsc28gc2V0IHRoZSBhZGRpdGlvbmFsIGBleGNsdXNpdmVgIHBhcmFtXG4gKiAgICAgICAgICAgICAgICAgICAgICAgIHRvIGB0cnVlYCB0aGF0IGFzc3VyZXMgbm8gb3RoZXIgcGFyYWxsZWwgYWRiIGNvbW1hbmRzXG4gKiAgICAgICAgICAgICAgICAgICAgICAgIGFyZSBnb2luZyB0byBiZSBleGVjdXRlZCB3aGlsZSB0aGUgY3VycmVudCBvbmUgaXMgcnVubmluZ1xuICogQHJldHVybiB7c3RyaW5nfSAtIENvbW1hbmQncyBzdGRvdXQuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGNvbW1hbmQgcmV0dXJuZWQgbm9uLXplcm8gZXhpdCBjb2RlLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5hZGJFeGVjID0gYXN5bmMgZnVuY3Rpb24gYWRiRXhlYyAoY21kLCBvcHRzID0ge30pIHtcbiAgaWYgKCFjbWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBuZWVkIHRvIHBhc3MgaW4gYSBjb21tYW5kIHRvIGFkYkV4ZWMoKScpO1xuICB9XG5cbiAgb3B0cyA9IF8uY2xvbmVEZWVwKG9wdHMpO1xuICAvLyBzZXR0aW5nIGRlZmF1bHQgdGltZW91dCBmb3IgZWFjaCBjb21tYW5kIHRvIHByZXZlbnQgaW5maW5pdGUgd2FpdC5cbiAgb3B0cy50aW1lb3V0ID0gb3B0cy50aW1lb3V0IHx8IHRoaXMuYWRiRXhlY1RpbWVvdXQgfHwgREVGQVVMVF9BREJfRVhFQ19USU1FT1VUO1xuICBvcHRzLnRpbWVvdXRDYXBOYW1lID0gb3B0cy50aW1lb3V0Q2FwTmFtZSB8fCAnYWRiRXhlY1RpbWVvdXQnOyAvLyBGb3IgZXJyb3IgbWVzc2FnZVxuXG4gIGNtZCA9IF8uaXNBcnJheShjbWQpID8gY21kIDogW2NtZF07XG4gIGxldCBhZGJSZXRyaWVkID0gZmFsc2U7XG4gIGNvbnN0IGV4ZWNGdW5jID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhcmdzID0gWy4uLnRoaXMuZXhlY3V0YWJsZS5kZWZhdWx0QXJncywgLi4uY21kXTtcbiAgICAgIGxvZy5kZWJ1ZyhgUnVubmluZyAnJHt0aGlzLmV4ZWN1dGFibGUucGF0aH0gJHtxdW90ZShhcmdzKX0nYCk7XG4gICAgICBsZXQge3N0ZG91dH0gPSBhd2FpdCBleGVjKHRoaXMuZXhlY3V0YWJsZS5wYXRoLCBhcmdzLCBvcHRzKTtcbiAgICAgIC8vIHNvbWV0aW1lcyBBREIgcHJpbnRzIG91dCB3ZWlyZCBzdGRvdXQgd2FybmluZ3MgdGhhdCB3ZSBkb24ndCB3YW50XG4gICAgICAvLyB0byBpbmNsdWRlIGluIGFueSBvZiB0aGUgcmVzcG9uc2UgZGF0YSwgc28gbGV0J3Mgc3RyaXAgaXQgb3V0XG4gICAgICBzdGRvdXQgPSBzdGRvdXQucmVwbGFjZShMSU5LRVJfV0FSTklOR19SRUdFWFAsICcnKS50cmltKCk7XG4gICAgICByZXR1cm4gc3Rkb3V0O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVyclRleHQgPSBgJHtlLm1lc3NhZ2V9LCAke2Uuc3Rkb3V0fSwgJHtlLnN0ZGVycn1gO1xuICAgICAgY29uc3QgcHJvdG9jb2xGYXVsdEVycm9yID0gUFJPVE9DT0xfRkFVTFRfRVJST1JfUkVHRVhQLnRlc3QoZXJyVGV4dCk7XG4gICAgICBjb25zdCBkZXZpY2VOb3RGb3VuZEVycm9yID0gREVWSUNFX05PVF9GT1VORF9FUlJPUl9SRUdFWFAudGVzdChlcnJUZXh0KTtcbiAgICAgIGNvbnN0IGRldmljZUNvbm5lY3RpbmdFcnJvciA9IERFVklDRV9DT05ORUNUSU5HX0VSUk9SX1JFR0VYUC50ZXN0KGVyclRleHQpO1xuICAgICAgaWYgKHByb3RvY29sRmF1bHRFcnJvciB8fCBkZXZpY2VOb3RGb3VuZEVycm9yIHx8IGRldmljZUNvbm5lY3RpbmdFcnJvcikge1xuICAgICAgICBsb2cuaW5mbyhgRXJyb3Igc2VuZGluZyBjb21tYW5kLCByZWNvbm5lY3RpbmcgZGV2aWNlIGFuZCByZXRyeWluZzogJHtjbWR9YCk7XG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xuICAgICAgICBhd2FpdCB0aGlzLmdldERldmljZXNXaXRoUmV0cnkoKTtcblxuICAgICAgICAvLyB0cnkgYWdhaW4gb25lIHRpbWVcbiAgICAgICAgaWYgKGFkYlJldHJpZWQpIHtcbiAgICAgICAgICBhZGJSZXRyaWVkID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gYXdhaXQgZXhlY0Z1bmMoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZS5jb2RlID09PSAwICYmIGUuc3Rkb3V0KSB7XG4gICAgICAgIHJldHVybiBlLnN0ZG91dC5yZXBsYWNlKExJTktFUl9XQVJOSU5HX1JFR0VYUCwgJycpLnRyaW0oKTtcbiAgICAgIH1cblxuICAgICAgaWYgKF8uaXNOdWxsKGUuY29kZSkpIHtcbiAgICAgICAgZS5tZXNzYWdlID0gYEVycm9yIGV4ZWN1dGluZyBhZGJFeGVjLiBPcmlnaW5hbCBlcnJvcjogJyR7ZS5tZXNzYWdlfScuIGAgK1xuICAgICAgICAgIGBUcnkgdG8gaW5jcmVhc2UgdGhlICR7b3B0cy50aW1lb3V0fW1zIGFkYiBleGVjdXRpb24gdGltZW91dCByZXByZXNlbnRlZCBieSAnJHtvcHRzLnRpbWVvdXRDYXBOYW1lfScgY2FwYWJpbGl0eWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlLm1lc3NhZ2UgPSBgRXJyb3IgZXhlY3V0aW5nIGFkYkV4ZWMuIE9yaWdpbmFsIGVycm9yOiAnJHtlLm1lc3NhZ2V9JzsgYCArXG4gICAgICAgICAgYFN0ZGVycjogJyR7KGUuc3RkZXJyIHx8ICcnKS50cmltKCl9JzsgQ29kZTogJyR7ZS5jb2RlfSdgO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKGlzRXhlY0xvY2tlZCkge1xuICAgIGxvZy5kZWJ1ZygnV2FpdGluZyB1bnRpbCB0aGUgb3RoZXIgZXhjbHVzaXZlIEFEQiBjb21tYW5kIGlzIGNvbXBsZXRlZCcpO1xuICAgIGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gIWlzRXhlY0xvY2tlZCwge1xuICAgICAgd2FpdE1zOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUixcbiAgICAgIGludGVydmFsTXM6IDEwLFxuICAgIH0pO1xuICAgIGxvZy5kZWJ1ZygnQ29udGludWluZyB3aXRoIHRoZSBjdXJyZW50IEFEQiBjb21tYW5kJyk7XG4gIH1cbiAgaWYgKG9wdHMuZXhjbHVzaXZlKSB7XG4gICAgaXNFeGVjTG9ja2VkID0gdHJ1ZTtcbiAgfVxuICB0cnkge1xuICAgIHJldHVybiBhd2FpdCBleGVjRnVuYygpO1xuICB9IGZpbmFsbHkge1xuICAgIGlmIChvcHRzLmV4Y2x1c2l2ZSkge1xuICAgICAgaXNFeGVjTG9ja2VkID0gZmFsc2U7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFNoZWxsRXhlY09wdGlvbnNcbiAqIEBwcm9wZXJ0eSB7P3N0cmluZ30gdGltZW91dENhcE5hbWUgW2FkYkV4ZWNUaW1lb3V0XSAtIHRoZSBuYW1lIG9mIHRoZSBjb3JyZXNwb25kaW5nIEFwcGl1bSdzIHRpbWVvdXQgY2FwYWJpbGl0eVxuICogKHVzZWQgaW4gdGhlIGVycm9yIG1lc3NhZ2VzKS5cbiAqIEBwcm9wZXJ0eSB7P251bWJlcn0gdGltZW91dCBbYWRiRXhlY1RpbWVvdXRdIC0gY29tbWFuZCBleGVjdXRpb24gdGltZW91dC5cbiAqIEBwcm9wZXJ0eSB7P2Jvb2xlYW59IHByaXZpbGVnZWQgW2ZhbHN5XSAtIFdoZXRoZXIgdG8gcnVuIHRoZSBnaXZlbiBjb21tYW5kIGFzIHJvb3QuXG4gKiBAcHJvcGVydHkgez9ib29sZWFufSBrZWVwUHJpdmlsZWdlZCBbZmFsc3ldIC0gV2hldGhlciB0byBrZWVwIHJvb3QgbW9kZSBhZnRlciBjb21tYW5kIGV4ZWN1dGlvbiBpcyBjb21wbGV0ZWQuXG4gKlxuICogQWxsIG90aGVyIHByb3BlcnRpZXMgYXJlIHRoZSBzYW1lIGFzIGZvciBgZXhlY2AgY2FsbCBmcm9tIHtAbGluayBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL25vZGUtdGVlbl9wcm9jZXNzfVxuICogbW9kdWxlXG4gKi9cblxuLyoqXG4gKiBFeGVjdXRlIHRoZSBnaXZlbiBjb21tYW5kIHVzaW5nIF9hZGIgc2hlbGxfIHByZWZpeC5cbiAqXG4gKiBAcGFyYW0geyFBcnJheS48c3RyaW5nPnxzdHJpbmd9IGNtZCAtIFRoZSBhcnJheSBvZiByZXN0IGNvbW1hbmQgbGluZSBwYXJhbWV0ZXJzIG9yIGEgc2luZ2xlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nIHBhcmFtZXRlci5cbiAqIEBwYXJhbSB7P1NoZWxsRXhlY09wdGlvbnN9IG9wdHMgW3t9XSAtIEFkZGl0aW9uYWwgb3B0aW9ucyBtYXBwaW5nLlxuICogQHJldHVybiB7c3RyaW5nfSAtIENvbW1hbmQncyBzdGRvdXQuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGNvbW1hbmQgcmV0dXJuZWQgbm9uLXplcm8gZXhpdCBjb2RlLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5zaGVsbCA9IGFzeW5jIGZ1bmN0aW9uIHNoZWxsIChjbWQsIG9wdHMgPSB7fSkge1xuICBjb25zdCB7XG4gICAgcHJpdmlsZWdlZCxcbiAgICBrZWVwUHJpdmlsZWdlZCxcbiAgfSA9IG9wdHM7XG5cbiAgLy8gSWYgdGhlIGNvbW1hbmQgcmVxdWlyZXMgcHJpdmlsZWdlcywgcm9vdCB0aGlzIGRldmljZVxuICBsZXQgc2hvdWxkUmVzdG9yZVVzZXIgPSBmYWxzZTtcbiAgaWYgKHByaXZpbGVnZWQpIHtcbiAgICBsb2cuaW5mbyhgJ2FkYiBzaGVsbCAke2NtZH0nIHJlcXVpcmVzIHJvb3QgYWNjZXNzLiBBdHRlbXB0aW5nIHRvIGdhaW4gcm9vdCBhY2Nlc3Mgbm93LmApO1xuICAgIGNvbnN0IHt3YXNBbHJlYWR5Um9vdGVkLCBpc1N1Y2Nlc3NmdWx9ID0gYXdhaXQgdGhpcy5yb290KCk7XG4gICAgc2hvdWxkUmVzdG9yZVVzZXIgPSAhd2FzQWxyZWFkeVJvb3RlZDtcbiAgICBpZiAod2FzQWxyZWFkeVJvb3RlZCkge1xuICAgICAgbG9nLmluZm8oJ0RldmljZSBhbHJlYWR5IGhhZCByb290IGFjY2VzcycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2cuaW5mbyhpc1N1Y2Nlc3NmdWwgPyAnUm9vdCBhY2Nlc3Mgc3VjY2Vzc2Z1bGx5IGdhaW5lZCcgOiAnQ291bGQgbm90IGdhaW4gcm9vdCBhY2Nlc3MnKTtcbiAgICB9XG4gIH1cbiAgbGV0IGRpZENvbW1hbmRGYWlsID0gZmFsc2U7XG4gIHRyeSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmFkYkV4ZWMoXy5pc0FycmF5KGNtZCkgPyBbJ3NoZWxsJywgLi4uY21kXSA6IFsnc2hlbGwnLCBjbWRdLCBvcHRzKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRpZENvbW1hbmRGYWlsID0gdHJ1ZTtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH0gZmluYWxseSB7XG4gICAgLy8gUmV0dXJuIHRoZSAncm9vdCcgc3RhdGUgdG8gd2hhdCBpdCB3YXMgYmVmb3JlICdzaGVsbCcgd2FzIGNhbGxlZFxuICAgIGlmIChwcml2aWxlZ2VkICYmIHNob3VsZFJlc3RvcmVVc2VyICYmICgha2VlcFByaXZpbGVnZWQgfHwgZGlkQ29tbWFuZEZhaWwpKSB7XG4gICAgICBjb25zdCB7aXNTdWNjZXNzZnVsfSA9IGF3YWl0IHRoaXMudW5yb290KCk7XG4gICAgICBsb2cuZGVidWcoaXNTdWNjZXNzZnVsID8gJ1JldHVybmVkIGRldmljZSB0byB1bnJvb3RlZCBzdGF0ZScgOiAnQ291bGQgbm90IHJldHVybiBkZXZpY2UgdG8gdW5yb290ZWQgc3RhdGUnKTtcbiAgICB9XG4gIH1cbn07XG5cbnN5c3RlbUNhbGxNZXRob2RzLmNyZWF0ZVN1YlByb2Nlc3MgPSBmdW5jdGlvbiBjcmVhdGVTdWJQcm9jZXNzIChhcmdzID0gW10pIHtcbiAgLy8gYWRkIHRoZSBkZWZhdWx0IGFyZ3VtZW50c1xuICBhcmdzID0gdGhpcy5leGVjdXRhYmxlLmRlZmF1bHRBcmdzLmNvbmNhdChhcmdzKTtcbiAgbG9nLmRlYnVnKGBDcmVhdGluZyBBREIgc3VicHJvY2VzcyB3aXRoIGFyZ3M6ICR7SlNPTi5zdHJpbmdpZnkoYXJncyl9YCk7XG4gIHJldHVybiBuZXcgU3ViUHJvY2Vzcyh0aGlzLmdldEFkYlBhdGgoKSwgYXJncyk7XG59O1xuXG4vKipcbiAqIFJldHJpZXZlIHRoZSBjdXJyZW50IGFkYiBwb3J0LlxuICogQHRvZG8gY2FuIHByb2JhYmx5IGRlcHJlY2F0ZSB0aGlzIG5vdyB0aGF0IHRoZSBsb2dpYyBpcyBqdXN0IHRvIHJlYWQgdGhpcy5hZGJQb3J0XG4gKiBAcmV0dXJuIHtudW1iZXJ9IFRoZSBjdXJyZW50IGFkYiBwb3J0IG51bWJlci5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuZ2V0QWRiU2VydmVyUG9ydCA9IGZ1bmN0aW9uIGdldEFkYlNlcnZlclBvcnQgKCkge1xuICByZXR1cm4gdGhpcy5hZGJQb3J0O1xufTtcblxuLyoqXG4gKiBSZXRyaWV2ZSB0aGUgY3VycmVudCBlbXVsYXRvciBwb3J0IGZyb20gX2FkYiBkZXZpdmVzXyBvdXRwdXQuXG4gKlxuICogQHJldHVybiB7bnVtYmVyfSBUaGUgY3VycmVudCBlbXVsYXRvciBwb3J0LlxuICogQHRocm93cyB7RXJyb3J9IElmIHRoZXJlIGFyZSBubyBjb25uZWN0ZWQgZGV2aWNlcy5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuZ2V0RW11bGF0b3JQb3J0ID0gYXN5bmMgZnVuY3Rpb24gZ2V0RW11bGF0b3JQb3J0ICgpIHtcbiAgbG9nLmRlYnVnKCdHZXR0aW5nIHJ1bm5pbmcgZW11bGF0b3IgcG9ydCcpO1xuICBpZiAodGhpcy5lbXVsYXRvclBvcnQgIT09IG51bGwpIHtcbiAgICByZXR1cm4gdGhpcy5lbXVsYXRvclBvcnQ7XG4gIH1cbiAgdHJ5IHtcbiAgICBsZXQgZGV2aWNlcyA9IGF3YWl0IHRoaXMuZ2V0Q29ubmVjdGVkRGV2aWNlcygpO1xuICAgIGxldCBwb3J0ID0gdGhpcy5nZXRQb3J0RnJvbUVtdWxhdG9yU3RyaW5nKGRldmljZXNbMF0udWRpZCk7XG4gICAgaWYgKHBvcnQpIHtcbiAgICAgIHJldHVybiBwb3J0O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEVtdWxhdG9yIHBvcnQgbm90IGZvdW5kYCk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBObyBkZXZpY2VzIGNvbm5lY3RlZC4gT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG59O1xuXG4vKipcbiAqIFJldHJpZXZlIHRoZSBjdXJyZW50IGVtdWxhdG9yIHBvcnQgYnkgcGFyc2luZyBlbXVsYXRvciBuYW1lIHN0cmluZy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZW1TdHIgLSBFbXVsYXRvciBuYW1lIHN0cmluZy5cbiAqIEByZXR1cm4ge251bWJlcnxib29sZWFufSBFaXRoZXIgdGhlIGN1cnJlbnQgZW11bGF0b3IgcG9ydCBvclxuICogICAgICAgICAgICAgICAgICAgICAgICAgIF9mYWxzZV8gaWYgcG9ydCBudW1iZXIgY2Fubm90IGJlIHBhcnNlZC5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuZ2V0UG9ydEZyb21FbXVsYXRvclN0cmluZyA9IGZ1bmN0aW9uIGdldFBvcnRGcm9tRW11bGF0b3JTdHJpbmcgKGVtU3RyKSB7XG4gIGxldCBwb3J0UGF0dGVybiA9IC9lbXVsYXRvci0oXFxkKykvO1xuICBpZiAocG9ydFBhdHRlcm4udGVzdChlbVN0cikpIHtcbiAgICByZXR1cm4gcGFyc2VJbnQocG9ydFBhdHRlcm4uZXhlYyhlbVN0cilbMV0sIDEwKTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vKipcbiAqIFJldHJpZXZlIHRoZSBsaXN0IG9mIGN1cnJlbnRseSBjb25uZWN0ZWQgZW11bGF0b3JzLlxuICpcbiAqIEByZXR1cm4ge0FycmF5LjxEZXZpY2U+fSBUaGUgbGlzdCBvZiBjb25uZWN0ZWQgZGV2aWNlcy5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuZ2V0Q29ubmVjdGVkRW11bGF0b3JzID0gYXN5bmMgZnVuY3Rpb24gZ2V0Q29ubmVjdGVkRW11bGF0b3JzICgpIHtcbiAgbG9nLmRlYnVnKCdHZXR0aW5nIGNvbm5lY3RlZCBlbXVsYXRvcnMnKTtcbiAgdHJ5IHtcbiAgICBsZXQgZGV2aWNlcyA9IGF3YWl0IHRoaXMuZ2V0Q29ubmVjdGVkRGV2aWNlcygpO1xuICAgIGxldCBlbXVsYXRvcnMgPSBbXTtcbiAgICBmb3IgKGxldCBkZXZpY2Ugb2YgZGV2aWNlcykge1xuICAgICAgbGV0IHBvcnQgPSB0aGlzLmdldFBvcnRGcm9tRW11bGF0b3JTdHJpbmcoZGV2aWNlLnVkaWQpO1xuICAgICAgaWYgKHBvcnQpIHtcbiAgICAgICAgZGV2aWNlLnBvcnQgPSBwb3J0O1xuICAgICAgICBlbXVsYXRvcnMucHVzaChkZXZpY2UpO1xuICAgICAgfVxuICAgIH1cbiAgICBsb2cuZGVidWcoYCR7ZW11bGF0b3JzLmxlbmd0aH0gZW11bGF0b3IocykgY29ubmVjdGVkYCk7XG4gICAgcmV0dXJuIGVtdWxhdG9ycztcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3IgZ2V0dGluZyBlbXVsYXRvcnMuIE9yaWdpbmFsIGVycm9yOiAke2UubWVzc2FnZX1gKTtcbiAgfVxufTtcblxuLyoqXG4gKiBTZXQgX2VtdWxhdG9yUG9ydF8gcHJvcGVydHkgb2YgdGhlIGN1cnJlbnQgY2xhc3MuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IGVtUG9ydCAtIFRoZSBlbXVsYXRvciBwb3J0IHRvIGJlIHNldC5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuc2V0RW11bGF0b3JQb3J0ID0gZnVuY3Rpb24gc2V0RW11bGF0b3JQb3J0IChlbVBvcnQpIHtcbiAgdGhpcy5lbXVsYXRvclBvcnQgPSBlbVBvcnQ7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgaWRlbnRpZmllciBvZiB0aGUgY3VycmVudCBkZXZpY2UgKF90aGlzLmN1ckRldmljZUlkXykuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IC0gVGhlIGRldmljZSBpZGVudGlmaWVyLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5zZXREZXZpY2VJZCA9IGZ1bmN0aW9uIHNldERldmljZUlkIChkZXZpY2VJZCkge1xuICBsb2cuZGVidWcoYFNldHRpbmcgZGV2aWNlIGlkIHRvICR7ZGV2aWNlSWR9YCk7XG4gIHRoaXMuY3VyRGV2aWNlSWQgPSBkZXZpY2VJZDtcbiAgbGV0IGFyZ3NIYXNEZXZpY2UgPSB0aGlzLmV4ZWN1dGFibGUuZGVmYXVsdEFyZ3MuaW5kZXhPZignLXMnKTtcbiAgaWYgKGFyZ3NIYXNEZXZpY2UgIT09IC0xKSB7XG4gICAgLy8gcmVtb3ZlIHRoZSBvbGQgZGV2aWNlIGlkIGZyb20gdGhlIGFyZ3VtZW50c1xuICAgIHRoaXMuZXhlY3V0YWJsZS5kZWZhdWx0QXJncy5zcGxpY2UoYXJnc0hhc0RldmljZSwgMik7XG4gIH1cbiAgdGhpcy5leGVjdXRhYmxlLmRlZmF1bHRBcmdzLnB1c2goJy1zJywgZGV2aWNlSWQpO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIHRoZSBjdXJyZW50IGRldmljZSBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtEZXZpY2V9IGRldmljZU9iaiAtIFRoZSBkZXZpY2Ugb2JqZWN0IHRvIGJlIHNldC5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuc2V0RGV2aWNlID0gZnVuY3Rpb24gc2V0RGV2aWNlIChkZXZpY2VPYmopIHtcbiAgbGV0IGRldmljZUlkID0gZGV2aWNlT2JqLnVkaWQ7XG4gIGxldCBlbVBvcnQgPSB0aGlzLmdldFBvcnRGcm9tRW11bGF0b3JTdHJpbmcoZGV2aWNlSWQpO1xuICB0aGlzLnNldEVtdWxhdG9yUG9ydChlbVBvcnQpO1xuICB0aGlzLnNldERldmljZUlkKGRldmljZUlkKTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBvYmplY3QgZm9yIHRoZSBjdXJyZW50bHkgcnVubmluZyBlbXVsYXRvci5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYXZkTmFtZSAtIEVtdWxhdG9yIG5hbWUuXG4gKiBAcmV0dXJuIHs/RGV2aWNlfSBDdXJyZW50bHkgcnVubmluZyBlbXVsYXRvciBvciBfbnVsbF8uXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmdldFJ1bm5pbmdBVkQgPSBhc3luYyBmdW5jdGlvbiBnZXRSdW5uaW5nQVZEIChhdmROYW1lKSB7XG4gIGxvZy5kZWJ1ZyhgVHJ5aW5nIHRvIGZpbmQgJyR7YXZkTmFtZX0nIGVtdWxhdG9yYCk7XG4gIHRyeSB7XG4gICAgY29uc3QgZW11bGF0b3JzID0gYXdhaXQgdGhpcy5nZXRDb25uZWN0ZWRFbXVsYXRvcnMoKTtcbiAgICBmb3IgKGNvbnN0IGVtdWxhdG9yIG9mIGVtdWxhdG9ycykge1xuICAgICAgdGhpcy5zZXRFbXVsYXRvclBvcnQoZW11bGF0b3IucG9ydCk7XG4gICAgICBjb25zdCBydW5uaW5nQVZETmFtZSA9IGF3YWl0IHRoaXMuc2VuZFRlbG5ldENvbW1hbmQoJ2F2ZCBuYW1lJyk7XG4gICAgICBpZiAoXy50b0xvd2VyKGF2ZE5hbWUpID09PSBfLnRvTG93ZXIocnVubmluZ0FWRE5hbWUpKSB7XG4gICAgICAgIGxvZy5kZWJ1ZyhgRm91bmQgZW11bGF0b3IgJyR7YXZkTmFtZX0nIG9uIHBvcnQgJHtlbXVsYXRvci5wb3J0fWApO1xuICAgICAgICB0aGlzLnNldERldmljZUlkKGVtdWxhdG9yLnVkaWQpO1xuICAgICAgICByZXR1cm4gZW11bGF0b3I7XG4gICAgICB9XG4gICAgfVxuICAgIGxvZy5kZWJ1ZyhgRW11bGF0b3IgJyR7YXZkTmFtZX0nIG5vdCBydW5uaW5nYCk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEVycm9yIGdldHRpbmcgQVZELiBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gIH1cbn07XG5cbi8qKlxuICogR2V0IHRoZSBvYmplY3QgZm9yIHRoZSBjdXJyZW50bHkgcnVubmluZyBlbXVsYXRvci5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYXZkTmFtZSAtIEVtdWxhdG9yIG5hbWUuXG4gKiBAcGFyYW0ge251bWJlcn0gdGltZW91dE1zIFsyMDAwMF0gLSBUaGUgbWF4aW11bSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0byB3YWl0IHVudGlsIGF0IGxlYXN0IG9uZSBydW5uaW5nIEFWRCBvYmplY3RcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzIGRldGVjdGVkLlxuICogQHJldHVybiB7P0RldmljZX0gQ3VycmVudGx5IHJ1bm5pbmcgZW11bGF0b3Igb3IgX251bGxfLlxuICogQHRocm93cyB7RXJyb3J9IElmIG5vIGRldmljZSBoYXMgYmVlbiBkZXRlY3RlZCB3aXRoaW4gdGhlIHRpbWVvdXQuXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmdldFJ1bm5pbmdBVkRXaXRoUmV0cnkgPSBhc3luYyBmdW5jdGlvbiBnZXRSdW5uaW5nQVZEV2l0aFJldHJ5IChhdmROYW1lLCB0aW1lb3V0TXMgPSAyMDAwMCkge1xuICBsZXQgcnVubmluZ0F2ZDtcbiAgdHJ5IHtcbiAgICBhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJ1bm5pbmdBdmQgPSBhd2FpdCB0aGlzLmdldFJ1bm5pbmdBVkQoYXZkTmFtZS5yZXBsYWNlKCdAJywgJycpKTtcbiAgICAgICAgcmV0dXJuIHJ1bm5pbmdBdmQ7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZy5kZWJ1ZyhlLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSwge1xuICAgICAgd2FpdE1zOiB0aW1lb3V0TXMsXG4gICAgICBpbnRlcnZhbE1zOiAxMDAwLFxuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBFcnJvciBnZXR0aW5nIEFWRCB3aXRoIHJldHJ5LiBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gIH1cbiAgcmV0dXJuIHJ1bm5pbmdBdmQ7XG59O1xuXG4vKipcbiAqIFNodXRkb3duIGFsbCBydW5uaW5nIGVtdWxhdG9ycyBieSBraWxsaW5nIHRoZWlyIHByb2Nlc3Nlcy5cbiAqXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYga2lsbGluZyB0b29sIHJldHVybmVkIG5vbi16ZXJvIHJldHVybiBjb2RlLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5raWxsQWxsRW11bGF0b3JzID0gYXN5bmMgZnVuY3Rpb24ga2lsbEFsbEVtdWxhdG9ycyAoKSB7XG4gIGxldCBjbWQsIGFyZ3M7XG4gIGlmIChzeXN0ZW0uaXNXaW5kb3dzKCkpIHtcbiAgICBjbWQgPSAnVEFTS0tJTEwnO1xuICAgIGFyZ3MgPSBbJ1RBU0tLSUxMJywgJy9JTScsICdlbXVsYXRvci5leGUnXTtcbiAgfSBlbHNlIHtcbiAgICBjbWQgPSAnL3Vzci9iaW4va2lsbGFsbCc7XG4gICAgYXJncyA9IFsnLW0nLCAnZW11bGF0b3IqJ107XG4gIH1cbiAgdHJ5IHtcbiAgICBhd2FpdCBleGVjKGNtZCwgYXJncyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEVycm9yIGtpbGxpbmcgZW11bGF0b3JzLiBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gIH1cbn07XG5cbi8qKlxuICogS2lsbCBlbXVsYXRvciB3aXRoIHRoZSBnaXZlbiBuYW1lLiBObyBlcnJvclxuICogaXMgdGhyb3duIGlzIGdpdmVuIGF2ZCBkb2VzIG5vdCBleGlzdC9pcyBub3QgcnVubmluZy5cbiAqXG4gKiBAcGFyYW0gez9zdHJpbmd9IGF2ZE5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgZW11bGF0b3IgdG8gYmUga2lsbGVkLiBJZiBlbXB0eSxcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBjdXJyZW50IGVtdWxhdG9yIHdpbGwgYmUga2lsbGVkLlxuICogQHBhcmFtIHs/bnVtYmVyfSB0aW1lb3V0IFs2MDAwMF0gLSBUaGUgYW1vdW50IG9mIHRpbWUgdG8gd2FpdCBiZWZvcmUgdGhyb3dpbmdcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYW4gZXhjZXB0aW9uIGFib3V0IHVuc3VjY2Vzc2Z1bCBraWxsaW5nXG4gKiBAcmV0dXJuIHtib29sZWFufSAtIFRydWUgaWYgdGhlIGVtdWxhdG9yIHdhcyBraWxsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqIEB0aHJvd3Mge0Vycm9yfSBpZiB0aGVyZSB3YXMgYSBmYWlsdXJlIGJ5IGtpbGxpbmcgdGhlIGVtdWxhdG9yXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmtpbGxFbXVsYXRvciA9IGFzeW5jIGZ1bmN0aW9uIGtpbGxFbXVsYXRvciAoYXZkTmFtZSA9IG51bGwsIHRpbWVvdXQgPSA2MDAwMCkge1xuICBpZiAodXRpbC5oYXNWYWx1ZShhdmROYW1lKSkge1xuICAgIGxvZy5kZWJ1ZyhgS2lsbGluZyBhdmQgJyR7YXZkTmFtZX0nYCk7XG4gICAgY29uc3QgZGV2aWNlID0gYXdhaXQgdGhpcy5nZXRSdW5uaW5nQVZEKGF2ZE5hbWUpO1xuICAgIGlmICghZGV2aWNlKSB7XG4gICAgICBsb2cuaW5mbyhgTm8gYXZkIHdpdGggbmFtZSAnJHthdmROYW1lfScgcnVubmluZy4gU2tpcHBpbmcga2lsbCBzdGVwLmApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyBraWxsaW5nIHRoZSBjdXJyZW50IGF2ZFxuICAgIGxvZy5kZWJ1ZyhgS2lsbGluZyBhdmQgd2l0aCBpZCAnJHt0aGlzLmN1ckRldmljZUlkfSdgKTtcbiAgICBpZiAoIWF3YWl0IHRoaXMuaXNFbXVsYXRvckNvbm5lY3RlZCgpKSB7XG4gICAgICBsb2cuZGVidWcoYEVtdWxhdG9yIHdpdGggaWQgJyR7dGhpcy5jdXJEZXZpY2VJZH0nIG5vdCBjb25uZWN0ZWQuIFNraXBwaW5nIGtpbGwgc3RlcGApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBhd2FpdCB0aGlzLmFkYkV4ZWMoWydlbXUnLCAna2lsbCddKTtcbiAgbG9nLmRlYnVnKGBXYWl0aW5nIHVwIHRvICR7dGltZW91dH1tcyB1bnRpbCB0aGUgZW11bGF0b3IgJyR7YXZkTmFtZSA/IGF2ZE5hbWUgOiB0aGlzLmN1ckRldmljZUlkfScgaXMga2lsbGVkYCk7XG4gIHRyeSB7XG4gICAgYXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gdXRpbC5oYXNWYWx1ZShhdmROYW1lKVxuICAgICAgICAgID8gIWF3YWl0IHRoaXMuZ2V0UnVubmluZ0FWRChhdmROYW1lKVxuICAgICAgICAgIDogIWF3YWl0IHRoaXMuaXNFbXVsYXRvckNvbm5lY3RlZCgpO1xuICAgICAgfSBjYXRjaCAoaWduKSB7fVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sIHtcbiAgICAgIHdhaXRNczogdGltZW91dCxcbiAgICAgIGludGVydmFsTXM6IDIwMDAsXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRoZSBlbXVsYXRvciAnJHthdmROYW1lID8gYXZkTmFtZSA6IHRoaXMuY3VyRGV2aWNlSWR9JyBpcyBzdGlsbCBydW5uaW5nIGFmdGVyIGJlaW5nIGtpbGxlZCAke3RpbWVvdXR9bXMgYWdvYCk7XG4gIH1cbiAgbG9nLmluZm8oYFN1Y2Nlc3NmdWxseSBraWxsZWQgdGhlICcke2F2ZE5hbWUgPyBhdmROYW1lIDogdGhpcy5jdXJEZXZpY2VJZH0nIGVtdWxhdG9yYCk7XG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBTdGFydCBhbiBlbXVsYXRvciB3aXRoIGdpdmVuIHBhcmFtZXRlcnMgYW5kIHdhaXQgdW50aWwgaXQgaXMgZnVsbCBzdGFydGVkLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBhdmROYW1lIC0gVGhlIG5hbWUgb2YgYW4gZXhpc3RpbmcgZW11bGF0b3IuXG4gKiBAcGFyYW0ge0FycmF5LjxzdHJpbmc+fHN0cmluZ30gYXZkQXJncyAtIEFkZGl0aW9uYWwgZW11bGF0b3IgY29tbWFuZCBsaW5lIGFyZ3VtZW50LlxuICogQHBhcmFtIHs/c3RyaW5nfSBsYW5ndWFnZSAtIEVtdWxhdG9yIHN5c3RlbSBsYW5ndWFnZS5cbiAqIEBwYXJhbSB7P2NvdW50cnl9IGNvdW50cnkgLSBFbXVsYXRvciBzeXN0ZW0gY291bnRyeS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBhdmRMYXVuY2hUaW1lb3V0IFs2MDAwMF0gLSBFbXVsYXRvciBzdGFydHVwIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzLlxuICogQHBhcmFtIHtudW1iZXJ9IHJldHJ5VGltZXMgWzFdIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIHN0YXJ0dXAgcmV0cmllcy5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGUgZW11bGF0b3IgZmFpbHMgdG8gc3RhcnQgd2l0aGluIHRoZSBnaXZlbiB0aW1lb3V0LlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5sYXVuY2hBVkQgPSBhc3luYyBmdW5jdGlvbiBsYXVuY2hBVkQgKGF2ZE5hbWUsIGF2ZEFyZ3MsIGxhbmd1YWdlLCBjb3VudHJ5LFxuICBhdmRMYXVuY2hUaW1lb3V0ID0gNjAwMDAsIGF2ZFJlYWR5VGltZW91dCA9IDYwMDAwLCByZXRyeVRpbWVzID0gMSkge1xuICBsb2cuZGVidWcoYExhdW5jaGluZyBFbXVsYXRvciB3aXRoIEFWRCAke2F2ZE5hbWV9LCBsYXVuY2hUaW1lb3V0IGAgK1xuICAgICAgICAgICAgYCR7YXZkTGF1bmNoVGltZW91dH1tcyBhbmQgcmVhZHlUaW1lb3V0ICR7YXZkUmVhZHlUaW1lb3V0fW1zYCk7XG4gIGxldCBlbXVsYXRvckJpbmFyeVBhdGggPSBhd2FpdCB0aGlzLmdldFNka0JpbmFyeVBhdGgoJ2VtdWxhdG9yJyk7XG4gIGlmIChhdmROYW1lWzBdID09PSAnQCcpIHtcbiAgICBhdmROYW1lID0gYXZkTmFtZS5zdWJzdHIoMSk7XG4gIH1cbiAgYXdhaXQgdGhpcy5jaGVja0F2ZEV4aXN0KGF2ZE5hbWUpO1xuICBsZXQgbGF1bmNoQXJncyA9IFsnLWF2ZCcsIGF2ZE5hbWVdO1xuICBpZiAoXy5pc1N0cmluZyhsYW5ndWFnZSkpIHtcbiAgICBsb2cuZGVidWcoYFNldHRpbmcgQW5kcm9pZCBEZXZpY2UgTGFuZ3VhZ2UgdG8gJHtsYW5ndWFnZX1gKTtcbiAgICBsYXVuY2hBcmdzLnB1c2goJy1wcm9wJywgYHBlcnNpc3Quc3lzLmxhbmd1YWdlPSR7bGFuZ3VhZ2UudG9Mb3dlckNhc2UoKX1gKTtcbiAgfVxuICBpZiAoXy5pc1N0cmluZyhjb3VudHJ5KSkge1xuICAgIGxvZy5kZWJ1ZyhgU2V0dGluZyBBbmRyb2lkIERldmljZSBDb3VudHJ5IHRvICR7Y291bnRyeX1gKTtcbiAgICBsYXVuY2hBcmdzLnB1c2goJy1wcm9wJywgYHBlcnNpc3Quc3lzLmNvdW50cnk9JHtjb3VudHJ5LnRvVXBwZXJDYXNlKCl9YCk7XG4gIH1cbiAgbGV0IGxvY2FsZTtcbiAgaWYgKF8uaXNTdHJpbmcobGFuZ3VhZ2UpICYmIF8uaXNTdHJpbmcoY291bnRyeSkpIHtcbiAgICBsb2NhbGUgPSBsYW5ndWFnZS50b0xvd2VyQ2FzZSgpICsgJy0nICsgY291bnRyeS50b1VwcGVyQ2FzZSgpO1xuICB9IGVsc2UgaWYgKF8uaXNTdHJpbmcobGFuZ3VhZ2UpKSB7XG4gICAgbG9jYWxlID0gbGFuZ3VhZ2UudG9Mb3dlckNhc2UoKTtcbiAgfSBlbHNlIGlmIChfLmlzU3RyaW5nKGNvdW50cnkpKSB7XG4gICAgbG9jYWxlID0gY291bnRyeTtcbiAgfVxuICBpZiAoXy5pc1N0cmluZyhsb2NhbGUpKSB7XG4gICAgbG9nLmRlYnVnKGBTZXR0aW5nIEFuZHJvaWQgRGV2aWNlIExvY2FsZSB0byAke2xvY2FsZX1gKTtcbiAgICBsYXVuY2hBcmdzLnB1c2goJy1wcm9wJywgYHBlcnNpc3Quc3lzLmxvY2FsZT0ke2xvY2FsZX1gKTtcbiAgfVxuICBpZiAoIV8uaXNFbXB0eShhdmRBcmdzKSkge1xuICAgIGxhdW5jaEFyZ3MucHVzaCguLi4oXy5pc0FycmF5KGF2ZEFyZ3MpID8gYXZkQXJncyA6IGF2ZEFyZ3Muc3BsaXQoJyAnKSkpO1xuICB9XG4gIGxvZy5kZWJ1ZyhgUnVubmluZyAnJHtlbXVsYXRvckJpbmFyeVBhdGh9JyB3aXRoIGFyZ3M6ICR7SlNPTi5zdHJpbmdpZnkobGF1bmNoQXJncyl9YCk7XG4gIGxldCBwcm9jID0gbmV3IFN1YlByb2Nlc3MoZW11bGF0b3JCaW5hcnlQYXRoLCBsYXVuY2hBcmdzKTtcbiAgYXdhaXQgcHJvYy5zdGFydCgwKTtcbiAgcHJvYy5vbignb3V0cHV0JywgKHN0ZG91dCwgc3RkZXJyKSA9PiB7XG4gICAgZm9yIChsZXQgbGluZSBvZiAoc3Rkb3V0IHx8IHN0ZGVyciB8fCAnJykuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKSkge1xuICAgICAgbG9nLmluZm8oYFtBVkQgT1VUUFVUXSAke2xpbmV9YCk7XG4gICAgfVxuICB9KTtcbiAgcHJvYy5vbignZGllJywgKGNvZGUsIHNpZ25hbCkgPT4ge1xuICAgIGxvZy53YXJuKGBFbXVsYXRvciBhdmQgJHthdmROYW1lfSBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX0ke3NpZ25hbCA/IGAsIHNpZ25hbCAke3NpZ25hbH1gIDogJyd9YCk7XG4gIH0pO1xuICBhd2FpdCByZXRyeShyZXRyeVRpbWVzLCBhc3luYyAoKSA9PiBhd2FpdCB0aGlzLmdldFJ1bm5pbmdBVkRXaXRoUmV0cnkoYXZkTmFtZSwgYXZkTGF1bmNoVGltZW91dCkpO1xuICBhd2FpdCB0aGlzLndhaXRGb3JFbXVsYXRvclJlYWR5KGF2ZFJlYWR5VGltZW91dCk7XG4gIHJldHVybiBwcm9jO1xufTtcblxuLyoqXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBBREJWZXJzaW9uXG4gKiBAcHJvcGVydHkge3N0cmluZ30gdmVyc2lvblN0cmluZyAtIEFEQiB2ZXJzaW9uIGFzIGEgc3RyaW5nLlxuICogQHByb3BlcnR5IHtmbG9hdH0gdmVyc2lvbkZsb2F0IC0gVmVyc2lvbiBudW1iZXIgYXMgZmxvYXQgdmFsdWUgKHVzZWZ1bCBmb3IgY29tcGFyaXNvbikuXG4gKiBAcHJvcGVydHkge251bWJlcn0gbWFqb3IgLSBNYWpvciB2ZXJzaW9uIG51bWJlci5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBtaW5vciAtIE1pbm9yIHZlcnNpb24gbnVtYmVyLlxuICogQHByb3BlcnR5IHtudW1iZXJ9IHBhdGNoIC0gUGF0Y2ggdmVyc2lvbiBudW1iZXIuXG4gKi9cblxuLyoqXG4gKiBHZXQgdGhlIGFkYiB2ZXJzaW9uLiBUaGUgcmVzdWx0IG9mIHRoaXMgbWV0aG9kIGlzIGNhY2hlZC5cbiAqXG4gKiBAcmV0dXJuIHtBREJWZXJzaW9ufSBUaGUgY3VycmVudCBhZGIgdmVyc2lvbi5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiBpdCBpcyBub3QgcG9zc2libGUgdG8gcGFyc2UgYWRiIHZlcnNpb24uXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmdldEFkYlZlcnNpb24gPSBfLm1lbW9pemUoYXN5bmMgZnVuY3Rpb24gZ2V0QWRiVmVyc2lvbiAoKSB7XG4gIHRyeSB7XG4gICAgbGV0IGFkYlZlcnNpb24gPSAoYXdhaXQgdGhpcy5hZGJFeGVjKCd2ZXJzaW9uJykpXG4gICAgICAucmVwbGFjZSgvQW5kcm9pZFxcc0RlYnVnXFxzQnJpZGdlXFxzdmVyc2lvblxccyhbXFxkLl0qKVtcXHNcXHctXSovLCAnJDEnKTtcbiAgICBsZXQgcGFydHMgPSBhZGJWZXJzaW9uLnNwbGl0KCcuJyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHZlcnNpb25TdHJpbmc6IGFkYlZlcnNpb24sXG4gICAgICB2ZXJzaW9uRmxvYXQ6IHBhcnNlRmxvYXQoYWRiVmVyc2lvbiksXG4gICAgICBtYWpvcjogcGFyc2VJbnQocGFydHNbMF0sIDEwKSxcbiAgICAgIG1pbm9yOiBwYXJzZUludChwYXJ0c1sxXSwgMTApLFxuICAgICAgcGF0Y2g6IHBhcnRzWzJdID8gcGFyc2VJbnQocGFydHNbMl0sIDEwKSA6IHVuZGVmaW5lZCxcbiAgICB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBFcnJvciBnZXR0aW5nIGFkYiB2ZXJzaW9uLiBPcmlnaW5hbCBlcnJvcjogJyR7ZS5tZXNzYWdlfSc7IGAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgYFN0ZGVycjogJyR7KGUuc3RkZXJyIHx8ICcnKS50cmltKCl9JzsgQ29kZTogJyR7ZS5jb2RlfSdgKTtcbiAgfVxufSk7XG5cbi8qKlxuICogQ2hlY2sgaWYgZ2l2ZW4gZW11bGF0b3IgZXhpc3RzIGluIHRoZSBsaXN0IG9mIGF2YWlsYWJsZSBhdmRzLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBhdmROYW1lIC0gVGhlIG5hbWUgb2YgZW11bGF0b3IgdG8gdmVyaWZ5IGZvciBleGlzdGVuY2UuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGVtdWxhdG9yIHdpdGggZ2l2ZW4gbmFtZSBkb2VzIG5vdCBleGlzdC5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuY2hlY2tBdmRFeGlzdCA9IGFzeW5jIGZ1bmN0aW9uIGNoZWNrQXZkRXhpc3QgKGF2ZE5hbWUpIHtcbiAgbGV0IGNtZCwgcmVzdWx0O1xuICB0cnkge1xuICAgIGNtZCA9IGF3YWl0IHRoaXMuZ2V0U2RrQmluYXJ5UGF0aCgnZW11bGF0b3InKTtcbiAgICByZXN1bHQgPSBhd2FpdCBleGVjKGNtZCwgWyctbGlzdC1hdmRzJ10pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbGV0IHVua25vd25PcHRpb25FcnJvciA9IG5ldyBSZWdFeHAoJ3Vua25vd24gb3B0aW9uOiAtbGlzdC1hdmRzJywgJ2knKS50ZXN0KGUuc3RkZXJyKTtcbiAgICBpZiAoIXVua25vd25PcHRpb25FcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBFcnJvciBleGVjdXRpbmcgY2hlY2tBdmRFeGlzdC4gT3JpZ2luYWwgZXJyb3I6ICcke2UubWVzc2FnZX0nOyBgICtcbiAgICAgICAgICAgICAgICAgICAgICBgU3RkZXJyOiAnJHsoZS5zdGRlcnIgfHwgJycpLnRyaW0oKX0nOyBDb2RlOiAnJHtlLmNvZGV9J2ApO1xuXG4gICAgfVxuICAgIGNvbnN0IHNka1ZlcnNpb24gPSBhd2FpdCBnZXRTZGtUb29sc1ZlcnNpb24oKTtcbiAgICBsZXQgYmluYXJ5TmFtZSA9ICdhbmRyb2lkJztcbiAgICBpZiAoc2RrVmVyc2lvbikge1xuICAgICAgaWYgKHNka1ZlcnNpb24ubWFqb3IgPj0gMjUpIHtcbiAgICAgICAgYmluYXJ5TmFtZSA9ICdhdmRtYW5hZ2VyJztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbG9nLndhcm4oYERlZmF1bHRpbmcgYmluYXJ5IG5hbWUgdG8gJyR7YmluYXJ5TmFtZX0nLCBiZWNhdXNlIFNESyB2ZXJzaW9uIGNhbm5vdCBiZSBwYXJzZWRgKTtcbiAgICB9XG4gICAgLy8gSWYgLWxpc3QtYXZkcyBvcHRpb24gaXMgbm90IGF2YWlsYWJsZSwgdXNlIGFuZHJvaWQgY29tbWFuZCBhcyBhbiBhbHRlcm5hdGl2ZVxuICAgIGNtZCA9IGF3YWl0IHRoaXMuZ2V0U2RrQmluYXJ5UGF0aChiaW5hcnlOYW1lKTtcbiAgICByZXN1bHQgPSBhd2FpdCBleGVjKGNtZCwgWydsaXN0JywgJ2F2ZCcsICctYyddKTtcbiAgfVxuICBpZiAocmVzdWx0LnN0ZG91dC5pbmRleE9mKGF2ZE5hbWUpID09PSAtMSkge1xuICAgIGxldCBleGlzdGluZ3MgPSBgKCR7cmVzdWx0LnN0ZG91dC50cmltKCkucmVwbGFjZSgvW1xcbl0vZywgJyksICgnKX0pYDtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEF2ZCAnJHthdmROYW1lfScgaXMgbm90IGF2YWlsYWJsZS4gcGxlYXNlIHNlbGVjdCB5b3VyIGF2ZCBuYW1lIGZyb20gb25lIG9mIHRoZXNlOiAnJHtleGlzdGluZ3N9J2ApO1xuICB9XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIHRoZSBjdXJyZW50IGVtdWxhdG9yIGlzIHJlYWR5IHRvIGFjY2VwdCBmdXJ0aGVyIGNvbW1hbmRzIChib290aW5nIGNvbXBsZXRlZCkuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IHRpbWVvdXRNcyBbMjAwMDBdIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0LlxuICogQHRocm93cyB7RXJyb3J9IElmIHRoZSBlbXVsYXRvciBpcyBub3QgcmVhZHkgd2l0aGluIHRoZSBnaXZlbiB0aW1lb3V0LlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy53YWl0Rm9yRW11bGF0b3JSZWFkeSA9IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JFbXVsYXRvclJlYWR5ICh0aW1lb3V0TXMgPSAyMDAwMCkge1xuICB0cnkge1xuICAgIGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCEoYXdhaXQgdGhpcy5zaGVsbChbJ2dldHByb3AnLCAnaW5pdC5zdmMuYm9vdGFuaW0nXSkpLmluY2x1ZGVzKCdzdG9wcGVkJykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU29tZXRpbWVzIHRoZSBwYWNrYWdlIG1hbmFnZXIgc2VydmljZSBtaWdodCBzdGlsbCBiZWluZyBpbml0aWFsaXplZFxuICAgICAgICAvLyBvbiBzbG93IHN5c3RlbXMgZXZlbiBhZnRlciBlbXVsYXRvciBib290aW5nIGlzIGNvbXBsZXRlZC5cbiAgICAgICAgLy8gVGhlIHVzdWFsIG91dHB1dCBvZiBgcG0gZ2V0LWluc3RhbGwtbG9jYXRpb25gIGNvbW1hbmQgbG9va3MgbGlrZSBgMFthdXRvXWBcbiAgICAgICAgcmV0dXJuIC9cXGQrXFxbXFx3K1xcXS8udGVzdChhd2FpdCB0aGlzLnNoZWxsKFsncG0nLCAnZ2V0LWluc3RhbGwtbG9jYXRpb24nXSkpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZy5kZWJ1ZyhgV2FpdGluZyBmb3IgZW11bGF0b3Igc3RhcnR1cC4gSW50ZXJtZWRpYXRlIGVycm9yOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSwge1xuICAgICAgd2FpdE1zOiB0aW1lb3V0TXMsXG4gICAgICBpbnRlcnZhbE1zOiAzMDAwLFxuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBFbXVsYXRvciBpcyBub3QgcmVhZHkgd2l0aGluICR7dGltZW91dE1zfW1zYCk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGN1cnJlbnQgZGV2aWNlIGlzIHJlYWR5IHRvIGFjY2VwdCBmdXJ0aGVyIGNvbW1hbmRzIChib290aW5nIGNvbXBsZXRlZCkuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IGFwcERldmljZVJlYWR5VGltZW91dCBbMzBdIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIHNlY29uZHMgdG8gd2FpdC5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGUgZGV2aWNlIGlzIG5vdCByZWFkeSB3aXRoaW4gdGhlIGdpdmVuIHRpbWVvdXQuXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLndhaXRGb3JEZXZpY2UgPSBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRGV2aWNlIChhcHBEZXZpY2VSZWFkeVRpbWVvdXQgPSAzMCkge1xuICB0aGlzLmFwcERldmljZVJlYWR5VGltZW91dCA9IGFwcERldmljZVJlYWR5VGltZW91dDtcbiAgY29uc3QgcmV0cmllcyA9IDM7XG4gIGNvbnN0IHRpbWVvdXQgPSBwYXJzZUludCh0aGlzLmFwcERldmljZVJlYWR5VGltZW91dCwgMTApIC8gcmV0cmllcyAqIDEwMDA7XG4gIGF3YWl0IHJldHJ5KHJldHJpZXMsIGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hZGJFeGVjKCd3YWl0LWZvci1kZXZpY2UnLCB7dGltZW91dH0pO1xuICAgICAgYXdhaXQgdGhpcy5waW5nKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgYXdhaXQgdGhpcy5yZXN0YXJ0QWRiKCk7XG4gICAgICBhd2FpdCB0aGlzLmdldENvbm5lY3RlZERldmljZXMoKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3Igd2FpdGluZyBmb3IgdGhlIGRldmljZSB0byBiZSBhdmFpbGFibGUuIE9yaWdpbmFsIGVycm9yOiAnJHtlLm1lc3NhZ2V9J2ApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vKipcbiAqIFJlYm9vdCB0aGUgY3VycmVudCBkZXZpY2UgYW5kIHdhaXQgdW50aWwgaXQgaXMgY29tcGxldGVkLlxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSByZXRyaWVzIFtERUZBVUxUX0FEQl9SRUJPT1RfUkVUUklFU10gLSBUaGUgbWF4aW11bSBudW1iZXIgb2YgcmVib290IHJldHJpZXMuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGRldmljZSBmYWlsZWQgdG8gcmVib290IGFuZCBudW1iZXIgb2YgcmV0cmllcyBpcyBleGNlZWRlZC5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMucmVib290ID0gYXN5bmMgZnVuY3Rpb24gcmVib290IChyZXRyaWVzID0gREVGQVVMVF9BREJfUkVCT09UX1JFVFJJRVMpIHtcbiAgLy8gR2V0IHJvb3QgYWNjZXNzIHNvIHdlIGNhbiBydW4gdGhlIG5leHQgc2hlbGwgY29tbWFuZHMgd2hpY2ggcmVxdWlyZSByb290IGFjY2Vzc1xuICBjb25zdCB7IHdhc0FscmVhZHlSb290ZWQgfSA9IGF3YWl0IHRoaXMucm9vdCgpO1xuICB0cnkge1xuICAgIC8vIFN0b3AgYW5kIHJlLXN0YXJ0IHRoZSBkZXZpY2VcbiAgICBhd2FpdCB0aGlzLnNoZWxsKFsnc3RvcCddKTtcbiAgICBhd2FpdCBCLmRlbGF5KDIwMDApOyAvLyBsZXQgdGhlIGVtdSBmaW5pc2ggc3RvcHBpbmc7XG4gICAgYXdhaXQgdGhpcy5zZXREZXZpY2VQcm9wZXJ0eSgnc3lzLmJvb3RfY29tcGxldGVkJywgMCwge1xuICAgICAgcHJpdmlsZWdlZDogZmFsc2UgLy8gbm8gbmVlZCB0byBzZXQgcHJpdmlsZWdlZCB0cnVlIGJlY2F1c2UgZGV2aWNlIGFscmVhZHkgcm9vdGVkXG4gICAgfSk7XG4gICAgYXdhaXQgdGhpcy5zaGVsbChbJ3N0YXJ0J10pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc3Qge21lc3NhZ2V9ID0gZTtcblxuICAgIC8vIHByb3ZpZGUgYSBoZWxwZnVsIGVycm9yIG1lc3NhZ2UgaWYgdGhlIHJlYXNvbiByZWJvb3QgZmFpbGVkIHdhcyBiZWNhdXNlIEFEQiBjb3VsZG4ndCBnYWluIHJvb3QgYWNjZXNzXG4gICAgaWYgKG1lc3NhZ2UuaW5jbHVkZXMoJ211c3QgYmUgcm9vdCcpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCByZWJvb3QgZGV2aWNlLiBSZWJvb3RpbmcgcmVxdWlyZXMgcm9vdCBhY2Nlc3MgYW5kIGAgK1xuICAgICAgICBgYXR0ZW1wdCB0byBnZXQgcm9vdCBhY2Nlc3Mgb24gZGV2aWNlIGZhaWxlZCB3aXRoIGVycm9yOiAnJHttZXNzYWdlfSdgKTtcbiAgICB9XG4gICAgdGhyb3cgZTtcbiAgfSBmaW5hbGx5IHtcbiAgICAvLyBSZXR1cm4gcm9vdCBzdGF0ZSB0byB3aGF0IGl0IHdhcyBiZWZvcmVcbiAgICBpZiAoIXdhc0FscmVhZHlSb290ZWQpIHtcbiAgICAgIGF3YWl0IHRoaXMudW5yb290KCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHN0YXJ0ZWQgPSBwcm9jZXNzLmhydGltZSgpO1xuICBhd2FpdCByZXRyeUludGVydmFsKHJldHJpZXMsIDEwMDAsIGFzeW5jICgpID0+IHtcbiAgICBpZiAoKGF3YWl0IHRoaXMuZ2V0RGV2aWNlUHJvcGVydHkoJ3N5cy5ib290X2NvbXBsZXRlZCcpKSA9PT0gJzEnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIHdlIGRvbid0IHdhbnQgdGhlIHN0YWNrIHRyYWNlLCBzbyBubyBsb2cuZXJyb3JBbmRUaHJvd1xuICAgIGNvbnN0IG1zZyA9IGBSZWJvb3QgaXMgbm90IGNvbXBsZXRlZCBhZnRlciAke3Byb2Nlc3MuaHJ0aW1lKHN0YXJ0ZWQpWzBdfXNgO1xuICAgIGxvZy5kZWJ1Zyhtc2cpO1xuICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICB9KTtcbn07XG5cbi8qKlxuICogQHR5cGVkZWYge09iamVjdH0gcm9vdFJlc3VsdFxuICogQHByb3BlcnR5IHtib29sZWFufSBpc1N1Y2Nlc3NmdWwgVHJ1ZSBpZiB0aGUgY2FsbCB0byByb290L3Vucm9vdCB3YXMgc3VjY2Vzc2Z1bFxuICogQHByb3BlcnR5IHtib29sZWFufSB3YXNBbHJlYWR5Um9vdGVkIFRydWUgaWYgdGhlIGRldmljZSB3YXMgYWxyZWFkeSByb290ZWRcbiAqL1xuXG4vKipcbiAqIFN3aXRjaCBhZGIgc2VydmVyIHJvb3QgcHJpdmlsZWdlcy5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNFbGV2YXRlZCAtIFNob3VsZCB3ZSBlbGV2YXRlIHRvIHRvIHJvb3Qgb3IgdW5yb290PyAoZGVmYXVsdCB0cnVlKVxuICogQHJldHVybiB7cm9vdFJlc3VsdH1cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuY2hhbmdlVXNlclByaXZpbGVnZXMgPSBhc3luYyBmdW5jdGlvbiBjaGFuZ2VVc2VyUHJpdmlsZWdlcyAoaXNFbGV2YXRlZCkge1xuICBjb25zdCBjbWQgPSBpc0VsZXZhdGVkID8gJ3Jvb3QnIDogJ3Vucm9vdCc7XG5cbiAgLy8gSWYgaXQncyBhbHJlYWR5IHJvb3RlZCwgb3VyIGpvYiBpcyBkb25lLiBObyBuZWVkIHRvIHJvb3QgaXQgYWdhaW4uXG4gIGNvbnN0IGlzUm9vdCA9IGF3YWl0IHRoaXMuaXNSb290KCk7XG4gIGlmICgoaXNSb290ICYmIGlzRWxldmF0ZWQpIHx8ICghaXNSb290ICYmICFpc0VsZXZhdGVkKSkge1xuICAgIHJldHVybiB7aXNTdWNjZXNzZnVsOiB0cnVlLCB3YXNBbHJlYWR5Um9vdGVkOiBpc1Jvb3R9O1xuICB9XG5cbiAgbGV0IHdhc0FscmVhZHlSb290ZWQgPSBpc1Jvb3Q7XG4gIHRyeSB7XG4gICAgbGV0IHtzdGRvdXR9ID0gYXdhaXQgdGhpcy5hZGJFeGVjKFtjbWRdKTtcblxuICAgIC8vIG9uIHJlYWwgZGV2aWNlcyBpbiBzb21lIHNpdHVhdGlvbnMgd2UgZ2V0IGFuIGVycm9yIGluIHRoZSBzdGRvdXRcbiAgICBpZiAoc3Rkb3V0KSB7XG4gICAgICBpZiAoc3Rkb3V0LmluY2x1ZGVzKCdhZGJkIGNhbm5vdCBydW4gYXMgcm9vdCcpKSB7XG4gICAgICAgIHJldHVybiB7aXNTdWNjZXNzZnVsOiBmYWxzZSwgd2FzQWxyZWFkeVJvb3RlZH07XG4gICAgICB9XG4gICAgICAvLyBpZiB0aGUgZGV2aWNlIHdhcyBhbHJlYWR5IHJvb3RlZCwgcmV0dXJuIHRoYXQgaW4gdGhlIHJlc3VsdFxuICAgICAgaWYgKHN0ZG91dC5pbmNsdWRlcygnYWxyZWFkeSBydW5uaW5nIGFzIHJvb3QnKSkge1xuICAgICAgICB3YXNBbHJlYWR5Um9vdGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtpc1N1Y2Nlc3NmdWw6IHRydWUsIHdhc0FscmVhZHlSb290ZWR9O1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zdCB7c3RkZXJyID0gJycsIG1lc3NhZ2V9ID0gZXJyO1xuICAgIGxvZy53YXJuKGBVbmFibGUgdG8gJHtjbWR9IGFkYiBkYWVtb24uIE9yaWdpbmFsIGVycm9yOiAnJHttZXNzYWdlfScuIFN0ZGVycjogJyR7c3RkZXJyfScuIENvbnRpbnVpbmcuYCk7XG5cbiAgICAvLyBDaGVjayB0aGUgb3V0cHV0IG9mIHRoZSBzdGRFcnIgdG8gc2VlIGlmIHRoZXJlJ3MgYW55IGNsdWVzIHRoYXQgc2hvdyB0aGF0IHRoZSBkZXZpY2Ugd2VudCBvZmZsaW5lXG4gICAgLy8gYW5kIGlmIGl0IGRpZCBnbyBvZmZsaW5lLCByZXN0YXJ0IEFEQlxuICAgIGlmIChbJ2Nsb3NlZCcsICdkZXZpY2Ugb2ZmbGluZScsICd0aW1lb3V0IGV4cGlyZWQnXS5zb21lKCh4KSA9PiBzdGRlcnIudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh4KSkpIHtcbiAgICAgIGxvZy53YXJuKGBBdHRlbXB0IHRvICdhZGIgJHtjbWR9JyBjYXVzZWQgZGV2aWNlIHRvIGdvIG9mZmxpbmUuIFJlc3RhcnRpbmcgYWRiLmApO1xuICAgICAgYXdhaXQgdGhpcy5yZXN0YXJ0QWRiKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtpc1N1Y2Nlc3NmdWw6IGZhbHNlLCB3YXNBbHJlYWR5Um9vdGVkfTtcbiAgfVxufTtcblxuLyoqXG4gKiBTd2l0Y2ggYWRiIHNlcnZlciB0byByb290IG1vZGVcbiAqIEByZXR1cm4ge3Jvb3RSZXN1bHR9XG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLnJvb3QgPSBhc3luYyBmdW5jdGlvbiByb290ICgpIHtcbiAgcmV0dXJuIGF3YWl0IHRoaXMuY2hhbmdlVXNlclByaXZpbGVnZXModHJ1ZSk7XG59O1xuXG4vKipcbiAqIFN3aXRjaCBhZGIgc2VydmVyIHRvIG5vbi1yb290IG1vZGUuXG4gKlxuICogQHJldHVybiB7cm9vdFJlc3VsdH1cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMudW5yb290ID0gYXN5bmMgZnVuY3Rpb24gdW5yb290ICgpIHtcbiAgcmV0dXJuIGF3YWl0IHRoaXMuY2hhbmdlVXNlclByaXZpbGVnZXMoZmFsc2UpO1xufTtcblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciB0aGUgY3VycmVudCB1c2VyIGlzIHJvb3RcbiAqXG4gKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSB1c2VyIGlzIHJvb3RcbiAqIEB0aHJvd3Mge0Vycm9yfSBpZiB0aGVyZSB3YXMgYW4gZXJyb3Igd2hpbGUgaWRlbnRpZnlpbmdcbiAqIHRoZSB1c2VyLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5pc1Jvb3QgPSBhc3luYyBmdW5jdGlvbiBpc1Jvb3QgKCkge1xuICByZXR1cm4gKGF3YWl0IHRoaXMuc2hlbGwoWyd3aG9hbWknXSkpLnRyaW0oKSA9PT0gJ3Jvb3QnO1xufTtcblxuLyoqXG4gKiBWZXJpZnkgd2hldGhlciBhIHJlbW90ZSBwYXRoIGV4aXN0cyBvbiB0aGUgZGV2aWNlIHVuZGVyIHRlc3QuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHJlbW90ZVBhdGggLSBUaGUgcmVtb3RlIHBhdGggdG8gdmVyaWZ5LlxuICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgZ2l2ZW4gcGF0aCBleGlzdHMgb24gdGhlIGRldmljZS5cbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuZmlsZUV4aXN0cyA9IGFzeW5jIGZ1bmN0aW9uIGZpbGVFeGlzdHMgKHJlbW90ZVBhdGgpIHtcbiAgbGV0IGZpbGVzID0gYXdhaXQgdGhpcy5scyhyZW1vdGVQYXRoKTtcbiAgcmV0dXJuIGZpbGVzLmxlbmd0aCA+IDA7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgb3V0cHV0IG9mIF9sc18gY29tbWFuZCBvbiB0aGUgZGV2aWNlIHVuZGVyIHRlc3QuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHJlbW90ZVBhdGggLSBUaGUgcmVtb3RlIHBhdGggKHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgX2xzXyBjb21tYW5kKS5cbiAqIEBwYXJhbSB7QXJyYXkuPFN0cmluZz59IG9wdHMgW1tdXSAtIEFkZGl0aW9uYWwgX2xzXyBvcHRpb25zLlxuICogQHJldHVybiB7QXJyYXkuPFN0cmluZz59IFRoZSBfbHNfIG91dHB1dCBhcyBhbiBhcnJheSBvZiBzcGxpdCBsaW5lcy5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICBBbiBlbXB0eSBhcnJheSBpcyByZXR1cm5lZCBvZiB0aGUgZ2l2ZW4gX3JlbW90ZVBhdGhfXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgZG9lcyBub3QgZXhpc3QuXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmxzID0gYXN5bmMgZnVuY3Rpb24gbHMgKHJlbW90ZVBhdGgsIG9wdHMgPSBbXSkge1xuICB0cnkge1xuICAgIGxldCBhcmdzID0gWydscycsIC4uLm9wdHMsIHJlbW90ZVBhdGhdO1xuICAgIGxldCBzdGRvdXQgPSBhd2FpdCB0aGlzLnNoZWxsKGFyZ3MpO1xuICAgIGxldCBsaW5lcyA9IHN0ZG91dC5zcGxpdCgnXFxuJyk7XG4gICAgcmV0dXJuIGxpbmVzLm1hcCgobCkgPT4gbC50cmltKCkpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuZmlsdGVyKChsKSA9PiBsLmluZGV4T2YoJ05vIHN1Y2ggZmlsZScpID09PSAtMSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIubWVzc2FnZS5pbmRleE9mKCdObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5JykgPT09IC0xKSB7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxufTtcblxuLyoqXG4gKiBHZXQgdGhlIHNpemUgb2YgdGhlIHBhcnRpY3VsYXIgZmlsZSBsb2NhdGVkIG9uIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVtb3RlUGF0aCAtIFRoZSByZW1vdGUgcGF0aCB0byB0aGUgZmlsZS5cbiAqIEByZXR1cm4ge251bWJlcn0gRmlsZSBzaXplIGluIGJ5dGVzLlxuICogQHRocm93cyB7RXJyb3J9IElmIHRoZXJlIHdhcyBhbiBlcnJvciB3aGlsZSBnZXR0aW5nIHRoZSBzaXplIG9mIHRoZSBnaXZlbiBmaWxlLlxuICovXG5zeXN0ZW1DYWxsTWV0aG9kcy5maWxlU2l6ZSA9IGFzeW5jIGZ1bmN0aW9uIGZpbGVTaXplIChyZW1vdGVQYXRoKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCB0aGlzLmxzKHJlbW90ZVBhdGgsIFsnLWxhJ10pO1xuICAgIGlmIChmaWxlcy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUmVtb3RlIHBhdGggaXMgbm90IGEgZmlsZWApO1xuICAgIH1cbiAgICAvLyBodHRwczovL3JlZ2V4MTAxLmNvbS9yL2ZPczRQNC84XG4gICAgY29uc3QgbWF0Y2ggPSAvW3J3eHNTdFRcXC0rXXsxMH1bXFxzXFxkXSpcXHNbXlxcc10rXFxzK1teXFxzXStcXHMrKFxcZCspLy5leGVjKGZpbGVzWzBdKTtcbiAgICBpZiAoIW1hdGNoIHx8IF8uaXNOYU4ocGFyc2VJbnQobWF0Y2hbMV0sIDEwKSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHBhcnNlIHNpemUgZnJvbSBsaXN0IG91dHB1dDogJyR7ZmlsZXNbMF19J2ApO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VJbnQobWF0Y2hbMV0sIDEwKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gZ2V0IGZpbGUgc2l6ZSBmb3IgJyR7cmVtb3RlUGF0aH0nOiAke2Vyci5tZXNzYWdlfWApO1xuICB9XG59O1xuXG4vKipcbiAqIEluc3RhbGxzIHRoZSBnaXZlbiBjZXJ0aWZpY2F0ZSBvbiBhIHJvb3RlZCByZWFsIGRldmljZSBvclxuICogYW4gZW11bGF0b3IuIFRoZSBlbXVsYXRvciBtdXN0IGJlIGV4ZWN1dGVkIHdpdGggYC13cml0YWJsZS1zeXN0ZW1gXG4gKiBjb21tYW5kIGxpbmUgb3B0aW9uIGFuZCBhZGIgZGFlbW9uIHNob3VsZCBiZSBydW5uaW5nIGluIHJvb3RcbiAqIG1vZGUgZm9yIHRoaXMgbWV0aG9kIHRvIHdvcmsgcHJvcGVybHkuIFRoZSBtZXRob2QgYWxzbyByZXF1aXJlc1xuICogb3BlbnNzbCB0b29sIHRvIGJlIGF2YWlsYWJsZSBvbiB0aGUgZGVzdGluYXRpb24gc3lzdGVtLlxuICogUmVhZCBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL2FwcGl1bS9pc3N1ZXMvMTA5NjRcbiAqIGZvciBtb3JlIGRldGFpbHMgb24gdGhpcyB0b3BpY1xuICpcbiAqIEBwYXJhbSB7QnVmZmVyfHN0cmluZ30gY2VydCAtIGJhc2U2NC1kZWNvZGVkIGNvbnRlbnQgb2YgdGhlIGFjdHVhbCBjZXJ0aWZpY2F0ZVxuICogcmVwcmVzZW50ZWQgYXMgYSBzdHJpbmcgb3IgYSBidWZmZXJcbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiBvcGVuc3NsIHRvb2wgaXMgbm90IGF2YWlsYWJsZSBvbiB0aGUgZGVzdGluYXRpb24gc3lzdGVtXG4gKiBvciBpZiB0aGVyZSB3YXMgYW4gZXJyb3Igd2hpbGUgaW5zdGFsbGluZyB0aGUgY2VydGlmaWNhdGVcbiAqL1xuc3lzdGVtQ2FsbE1ldGhvZHMuaW5zdGFsbE1pdG1DZXJ0aWZpY2F0ZSA9IGFzeW5jIGZ1bmN0aW9uIGluc3RhbGxNaXRtQ2VydGlmaWNhdGUgKGNlcnQpIHtcbiAgY29uc3Qgb3BlblNzbCA9IGF3YWl0IGdldE9wZW5Tc2xGb3JPcygpO1xuXG4gIGlmICghXy5pc0J1ZmZlcihjZXJ0KSkge1xuICAgIGNlcnQgPSBCdWZmZXIuZnJvbShjZXJ0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCB0bXBSb290ID0gYXdhaXQgdGVtcERpci5vcGVuRGlyKCk7XG4gIHRyeSB7XG4gICAgY29uc3Qgc3JjQ2VydCA9IHBhdGgucmVzb2x2ZSh0bXBSb290LCAnc291cmNlLmNlcicpO1xuICAgIGF3YWl0IGZzLndyaXRlRmlsZShzcmNDZXJ0LCBjZXJ0KTtcbiAgICBsZXQge3N0ZG91dH0gPSBhd2FpdCBleGVjKG9wZW5Tc2wsIFsneDUwOScsICctbm9vdXQnLCAnLWhhc2gnLCAnLWluJywgc3JjQ2VydF0pO1xuICAgIGNvbnN0IGNlcnRIYXNoID0gc3Rkb3V0LnRyaW0oKTtcbiAgICBsb2cuZGVidWcoYEdvdCBjZXJ0aWZpY2F0ZSBoYXNoOiAke2NlcnRIYXNofWApO1xuICAgIGxvZy5kZWJ1ZygnUHJlcGFyaW5nIGNlcnRpZmljYXRlIGNvbnRlbnQnKTtcbiAgICAoe3N0ZG91dH0gPSBhd2FpdCBleGVjKG9wZW5Tc2wsIFsneDUwOScsICctaW4nLCBzcmNDZXJ0XSwge2lzQnVmZmVyOiB0cnVlfSkpO1xuICAgIGxldCBkc3RDZXJ0Q29udGVudCA9IHN0ZG91dDtcbiAgICAoe3N0ZG91dH0gPSBhd2FpdCBleGVjKG9wZW5Tc2wsIFsneDUwOScsXG4gICAgICAnLWluJywgc3JjQ2VydCxcbiAgICAgICctdGV4dCcsXG4gICAgICAnLWZpbmdlcnByaW50JyxcbiAgICAgICctbm9vdXQnXSwge2lzQnVmZmVyOiB0cnVlfSkpO1xuICAgIGRzdENlcnRDb250ZW50ID0gQnVmZmVyLmNvbmNhdChbZHN0Q2VydENvbnRlbnQsIHN0ZG91dF0pO1xuICAgIGNvbnN0IGRzdENlcnQgPSBwYXRoLnJlc29sdmUodG1wUm9vdCwgYCR7Y2VydEhhc2h9LjBgKTtcbiAgICBhd2FpdCBmcy53cml0ZUZpbGUoZHN0Q2VydCwgZHN0Q2VydENvbnRlbnQpO1xuICAgIGxvZy5kZWJ1ZygnUmVtb3VudGluZyAvc3lzdGVtIGluIHJ3IG1vZGUnKTtcbiAgICAvLyBTb21ldGltZXMgZW11bGF0b3IgcmVib290IGlzIHN0aWxsIG5vdCBmdWxseSBmaW5pc2hlZCBvbiB0aGlzIHN0YWdlLCBzbyByZXRyeVxuICAgIGF3YWl0IHJldHJ5SW50ZXJ2YWwoNSwgMjAwMCwgYXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5hZGJFeGVjKFsncmVtb3VudCddKSk7XG4gICAgbG9nLmRlYnVnKGBVcGxvYWRpbmcgdGhlIGdlbmVyYXRlZCBjZXJ0aWZpY2F0ZSBmcm9tICcke2RzdENlcnR9JyB0byAnJHtDRVJUU19ST09UfSdgKTtcbiAgICBhd2FpdCB0aGlzLnB1c2goZHN0Q2VydCwgQ0VSVFNfUk9PVCk7XG4gICAgbG9nLmRlYnVnKCdSZW1vdW50aW5nIC9zeXN0ZW0gdG8gY29uZmlybSBjaGFuZ2VzJyk7XG4gICAgYXdhaXQgdGhpcy5hZGJFeGVjKFsncmVtb3VudCddKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgaW5qZWN0IHRoZSBjdXN0b20gY2VydGlmaWNhdGUuIGAgK1xuICAgICAgICAgICAgICAgICAgICBgSXMgdGhlIGNlcnRpZmljYXRlIHByb3Blcmx5IGVuY29kZWQgaW50byBiYXNlNjQtc3RyaW5nPyBgICtcbiAgICAgICAgICAgICAgICAgICAgYERvIHlvdSBoYXZlIHJvb3QgcGVybWlzc2lvbnMgb24gdGhlIGRldmljZT8gYCArXG4gICAgICAgICAgICAgICAgICAgIGBPcmlnaW5hbCBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBhd2FpdCBmcy5yaW1yYWYodG1wUm9vdCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmVyaWZpZXMgaWYgdGhlIGdpdmVuIHJvb3QgY2VydGlmaWNhdGUgaXMgYWxyZWFkeSBpbnN0YWxsZWQgb24gdGhlIGRldmljZS5cbiAqXG4gKiBAcGFyYW0ge0J1ZmZlcnxzdHJpbmd9IGNlcnQgLSBiYXNlNjQtZGVjb2RlZCBjb250ZW50IG9mIHRoZSBhY3R1YWwgY2VydGlmaWNhdGVcbiAqIHJlcHJlc2VudGVkIGFzIGEgc3RyaW5nIG9yIGEgYnVmZmVyXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgb3BlbnNzbCB0b29sIGlzIG5vdCBhdmFpbGFibGUgb24gdGhlIGRlc3RpbmF0aW9uIHN5c3RlbVxuICogb3IgaWYgdGhlcmUgd2FzIGFuIGVycm9yIHdoaWxlIGNoZWNraW5nIHRoZSBjZXJ0aWZpY2F0ZVxuICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIGdpdmVuIGNlcnRpZmljYXRlIGlzIGFscmVhZHkgaW5zdGFsbGVkXG4gKi9cbnN5c3RlbUNhbGxNZXRob2RzLmlzTWl0bUNlcnRpZmljYXRlSW5zdGFsbGVkID0gYXN5bmMgZnVuY3Rpb24gaXNNaXRtQ2VydGlmaWNhdGVJbnN0YWxsZWQgKGNlcnQpIHtcbiAgY29uc3Qgb3BlblNzbCA9IGF3YWl0IGdldE9wZW5Tc2xGb3JPcygpO1xuXG4gIGlmICghXy5pc0J1ZmZlcihjZXJ0KSkge1xuICAgIGNlcnQgPSBCdWZmZXIuZnJvbShjZXJ0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCB0bXBSb290ID0gYXdhaXQgdGVtcERpci5vcGVuRGlyKCk7XG4gIGxldCBjZXJ0SGFzaDtcbiAgdHJ5IHtcbiAgICBjb25zdCB0bXBDZXJ0ID0gcGF0aC5yZXNvbHZlKHRtcFJvb3QsICdzb3VyY2UuY2VyJyk7XG4gICAgYXdhaXQgZnMud3JpdGVGaWxlKHRtcENlcnQsIGNlcnQpO1xuICAgIGNvbnN0IHtzdGRvdXR9ID0gYXdhaXQgZXhlYyhvcGVuU3NsLCBbJ3g1MDknLCAnLW5vb3V0JywgJy1oYXNoJywgJy1pbicsIHRtcENlcnRdKTtcbiAgICBjZXJ0SGFzaCA9IHN0ZG91dC50cmltKCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJldHJpZXZlIHRoZSBjZXJ0aWZpY2F0ZSBoYXNoLiBgICtcbiAgICAgICAgICAgICAgICAgICAgYElzIHRoZSBjZXJ0aWZpY2F0ZSBwcm9wZXJseSBlbmNvZGVkIGludG8gYmFzZTY0LXN0cmluZz8gYCArXG4gICAgICAgICAgICAgICAgICAgIGBPcmlnaW5hbCBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBhd2FpdCBmcy5yaW1yYWYodG1wUm9vdCk7XG4gIH1cbiAgY29uc3QgZHN0UGF0aCA9IHBhdGgucG9zaXgucmVzb2x2ZShDRVJUU19ST09ULCBgJHtjZXJ0SGFzaH0uMGApO1xuICBsb2cuZGVidWcoYENoZWNraW5nIGlmIHRoZSBjZXJ0aWZpY2F0ZSBpcyBhbHJlYWR5IGluc3RhbGxlZCBhdCAnJHtkc3RQYXRofSdgKTtcbiAgcmV0dXJuIGF3YWl0IHRoaXMuZmlsZUV4aXN0cyhkc3RQYXRoKTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IHN5c3RlbUNhbGxNZXRob2RzO1xuZXhwb3J0IHsgREVGQVVMVF9BREJfRVhFQ19USU1FT1VUIH07XG4iXSwiZmlsZSI6ImxpYi90b29scy9zeXN0ZW0tY2FsbHMuanMiLCJzb3VyY2VSb290IjoiLi4vLi4vLi4ifQ==
