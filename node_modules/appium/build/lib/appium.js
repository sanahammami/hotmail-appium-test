"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AppiumDriver = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

var _config = require("./config");

var _appiumBaseDriver = require("appium-base-driver");

var _bluebird = _interopRequireDefault(require("bluebird"));

var _asyncLock = _interopRequireDefault(require("async-lock"));

var _utils = require("./utils");

var _semver = _interopRequireDefault(require("semver"));

var _wordWrap = _interopRequireDefault(require("word-wrap"));

var _os = require("os");

const PLATFORMS = {
  FAKE: 'fake',
  ANDROID: 'android',
  IOS: 'ios',
  APPLE_TVOS: 'tvos',
  WINDOWS: 'windows',
  MAC: 'mac',
  TIZEN: 'tizen'
};
const AUTOMATION_NAMES = {
  APPIUM: 'Appium',
  UIAUTOMATOR2: 'UiAutomator2',
  UIAUTOMATOR1: 'UiAutomator1',
  XCUITEST: 'XCUITest',
  YOUIENGINE: 'YouiEngine',
  ESPRESSO: 'Espresso',
  TIZEN: 'Tizen',
  FAKE: 'Fake',
  INSTRUMENTS: 'Instruments',
  WINDOWS: 'Windows',
  MAC: 'Mac'
};
const DRIVER_MAP = {
  [AUTOMATION_NAMES.UIAUTOMATOR2.toLowerCase()]: {
    driverClassName: 'AndroidUiautomator2Driver',
    driverPackage: 'appium-uiautomator2-driver'
  },
  [AUTOMATION_NAMES.XCUITEST.toLowerCase()]: {
    driverClassName: 'XCUITestDriver',
    driverPackage: 'appium-xcuitest-driver'
  },
  [AUTOMATION_NAMES.YOUIENGINE.toLowerCase()]: {
    driverClassName: 'YouiEngineDriver',
    driverPackage: 'appium-youiengine-driver'
  },
  [AUTOMATION_NAMES.FAKE.toLowerCase()]: {
    driverClassName: 'FakeDriver',
    driverPackage: 'appium-fake-driver'
  },
  [AUTOMATION_NAMES.UIAUTOMATOR1.toLowerCase()]: {
    driverClassName: 'AndroidDriver',
    driverPackage: 'appium-android-driver'
  },
  [AUTOMATION_NAMES.INSTRUMENTS.toLowerCase()]: {
    driverClassName: 'IosDriver',
    driverPackage: 'appium-ios-driver'
  },
  [AUTOMATION_NAMES.WINDOWS.toLowerCase()]: {
    driverClassName: 'WindowsDriver',
    driverPackage: 'appium-windows-driver'
  },
  [AUTOMATION_NAMES.MAC.toLowerCase()]: {
    driverClassName: 'MacDriver',
    driverPackage: 'appium-mac-driver'
  },
  [AUTOMATION_NAMES.ESPRESSO.toLowerCase()]: {
    driverClassName: 'EspressoDriver',
    driverPackage: 'appium-espresso-driver'
  },
  [AUTOMATION_NAMES.TIZEN.toLowerCase()]: {
    driverClassName: 'TizenDriver',
    driverPackage: 'appium-tizen-driver'
  }
};
const PLATFORMS_MAP = {
  [PLATFORMS.FAKE]: () => AUTOMATION_NAMES.FAKE,
  [PLATFORMS.ANDROID]: () => {
    const logDividerLength = 70;
    const automationWarning = [`The 'automationName' capability was not provided in the desired capabilities for this Android session`, `Setting 'automationName=UiAutomator2' by default and using the UiAutomator2 Driver`, `The next major version of Appium (2.x) will **require** the 'automationName' capability to be set for all sessions on all platforms`, `In previous versions (Appium <= 1.13.x), the default was 'automationName=UiAutomator1'`, `If you wish to use that automation instead of UiAutomator2, please add 'automationName=UiAutomator1' to your desired capabilities`, `For more information about drivers, please visit http://appium.io/docs/en/about-appium/intro/ and explore the 'Drivers' menu`];
    let divider = `${_os.EOL}${_lodash.default.repeat('=', logDividerLength)}${_os.EOL}`;
    let automationWarningString = divider;
    automationWarningString += `  DEPRECATION WARNING:` + _os.EOL;

    for (let log of automationWarning) {
      automationWarningString += _os.EOL + (0, _wordWrap.default)(log, {
        width: logDividerLength - 2
      }) + _os.EOL;
    }

    automationWarningString += divider;

    _logger.default.warn(automationWarningString);

    return AUTOMATION_NAMES.UIAUTOMATOR2;
  },
  [PLATFORMS.IOS]: caps => {
    const platformVersion = _semver.default.valid(_semver.default.coerce(caps.platformVersion));

    _logger.default.warn(`DeprecationWarning: 'automationName' capability was not provided. ` + `Future versions of Appium will require 'automationName' capability to be set for iOS sessions.`);

    if (platformVersion && _semver.default.satisfies(platformVersion, '>=10.0.0')) {
      _logger.default.info('Requested iOS support with version >= 10, ' + `using '${AUTOMATION_NAMES.XCUITEST}' ` + 'driver instead of UIAutomation-based driver, since the ' + 'latter is unsupported on iOS 10 and up.');

      return AUTOMATION_NAMES.XCUITEST;
    }

    return AUTOMATION_NAMES.INSTRUMENTS;
  },
  [PLATFORMS.APPLE_TVOS]: () => AUTOMATION_NAMES.XCUITEST,
  [PLATFORMS.WINDOWS]: () => AUTOMATION_NAMES.WINDOWS,
  [PLATFORMS.MAC]: () => AUTOMATION_NAMES.MAC,
  [PLATFORMS.TIZEN]: () => AUTOMATION_NAMES.TIZEN
};
const desiredCapabilityConstraints = {
  automationName: {
    presence: false,
    isString: true,
    inclusionCaseInsensitive: _lodash.default.values(AUTOMATION_NAMES)
  },
  platformName: {
    presence: true,
    isString: true,
    inclusionCaseInsensitive: _lodash.default.keys(PLATFORMS_MAP)
  }
};
const sessionsListGuard = new _asyncLock.default();
const pendingDriversGuard = new _asyncLock.default();

class AppiumDriver extends _appiumBaseDriver.BaseDriver {
  constructor(args) {
    if (args.tmpDir) {
      process.env.APPIUM_TMP_DIR = args.tmpDir;
    }

    super(args);
    this.desiredCapConstraints = desiredCapabilityConstraints;
    this.newCommandTimeoutMs = 0;
    this.args = Object.assign({}, args);
    this.sessions = {};
    this.pendingDrivers = {};
    (0, _config.updateBuildInfo)();
  }

  get isCommandsQueueEnabled() {
    return false;
  }

  sessionExists(sessionId) {
    const dstSession = this.sessions[sessionId];
    return dstSession && dstSession.sessionId !== null;
  }

  driverForSession(sessionId) {
    return this.sessions[sessionId];
  }

  getDriverAndVersionForCaps(caps) {
    if (!_lodash.default.isString(caps.platformName)) {
      throw new Error('You must include a platformName capability');
    }

    const platformName = caps.platformName.toLowerCase();
    let automationNameCap = caps.automationName;

    if (!_lodash.default.isString(automationNameCap) || automationNameCap.toLowerCase() === 'appium') {
      const driverSelector = PLATFORMS_MAP[platformName];

      if (driverSelector) {
        automationNameCap = driverSelector(caps);
      }
    }

    automationNameCap = automationNameCap.toLowerCase();

    try {
      const {
        driverPackage,
        driverClassName
      } = DRIVER_MAP[automationNameCap];

      const driver = require(driverPackage)[driverClassName];

      return {
        driver,
        version: this.getDriverVersion(driver.name, driverPackage)
      };
    } catch (ign) {}

    const msg = _lodash.default.isString(caps.automationName) ? `Could not find a driver for automationName '${caps.automationName}' and platformName ` + `'${caps.platformName}'.` : `Could not find a driver for platformName '${caps.platformName}'.`;
    throw new Error(`${msg} Please check your desired capabilities.`);
  }

  getDriverVersion(driverName, driverPackage) {
    const version = (0, _utils.getPackageVersion)(driverPackage);

    if (version) {
      return version;
    }

    _logger.default.warn(`Unable to get version of driver '${driverName}'`);
  }

  async getStatus() {
    return {
      build: _lodash.default.clone((0, _config.getBuildInfo)())
    };
  }

  async getSessions() {
    const sessions = await sessionsListGuard.acquire(AppiumDriver.name, () => this.sessions);
    return _lodash.default.toPairs(sessions).map(([id, driver]) => {
      return {
        id,
        capabilities: driver.caps
      };
    });
  }

  printNewSessionAnnouncement(driverName, driverVersion) {
    const introString = driverVersion ? `Appium v${_config.APPIUM_VER} creating new ${driverName} (v${driverVersion}) session` : `Appium v${_config.APPIUM_VER} creating new ${driverName} session`;

    _logger.default.info(introString);
  }

  async createSession(jsonwpCaps, reqCaps, w3cCapabilities) {
    const defaultCapabilities = _lodash.default.cloneDeep(this.args.defaultCapabilities);

    const defaultSettings = (0, _utils.pullSettings)(defaultCapabilities);
    jsonwpCaps = _lodash.default.cloneDeep(jsonwpCaps);
    const jwpSettings = Object.assign({}, defaultSettings, (0, _utils.pullSettings)(jsonwpCaps));
    w3cCapabilities = _lodash.default.cloneDeep(w3cCapabilities);
    const w3cSettings = Object.assign({}, jwpSettings);
    Object.assign(w3cSettings, (0, _utils.pullSettings)((w3cCapabilities || {}).alwaysMatch || {}));

    for (const firstMatchEntry of (w3cCapabilities || {}).firstMatch || []) {
      Object.assign(w3cSettings, (0, _utils.pullSettings)(firstMatchEntry));
    }

    let protocol;
    let innerSessionId, dCaps;

    try {
      const parsedCaps = (0, _utils.parseCapsForInnerDriver)(jsonwpCaps, w3cCapabilities, this.desiredCapConstraints, defaultCapabilities);
      const {
        desiredCaps,
        processedJsonwpCapabilities,
        processedW3CCapabilities,
        error
      } = parsedCaps;
      protocol = parsedCaps.protocol;

      if (error) {
        throw error;
      }

      const {
        driver: InnerDriver,
        version: driverVersion
      } = this.getDriverAndVersionForCaps(desiredCaps);
      this.printNewSessionAnnouncement(InnerDriver.name, driverVersion);

      if (this.args.sessionOverride) {
        const sessionIdsToDelete = await sessionsListGuard.acquire(AppiumDriver.name, () => _lodash.default.keys(this.sessions));

        if (sessionIdsToDelete.length) {
          _logger.default.info(`Session override is on. Deleting other ${sessionIdsToDelete.length} active session${sessionIdsToDelete.length ? '' : 's'}.`);

          try {
            await _bluebird.default.map(sessionIdsToDelete, id => this.deleteSession(id));
          } catch (ign) {}
        }
      }

      let runningDriversData, otherPendingDriversData;
      const d = new InnerDriver(this.args);

      if (this.args.relaxedSecurityEnabled) {
        _logger.default.info(`Applying relaxed security to '${InnerDriver.name}' as per ` + `server command line argument. All insecure features will be ` + `enabled unless explicitly disabled by --deny-insecure`);

        d.relaxedSecurityEnabled = true;
      }

      if (!_lodash.default.isEmpty(this.args.denyInsecure)) {
        _logger.default.info('Explicitly preventing use of insecure features:');

        this.args.denyInsecure.map(a => _logger.default.info(`    ${a}`));
        d.denyInsecure = this.args.denyInsecure;
      }

      if (!_lodash.default.isEmpty(this.args.allowInsecure)) {
        _logger.default.info('Explicitly enabling use of insecure features:');

        this.args.allowInsecure.map(a => _logger.default.info(`    ${a}`));
        d.allowInsecure = this.args.allowInsecure;
      }

      d.server = this.server;

      try {
        runningDriversData = await this.curSessionDataForDriver(InnerDriver);
      } catch (e) {
        throw new _appiumBaseDriver.errors.SessionNotCreatedError(e.message);
      }

      await pendingDriversGuard.acquire(AppiumDriver.name, () => {
        this.pendingDrivers[InnerDriver.name] = this.pendingDrivers[InnerDriver.name] || [];
        otherPendingDriversData = this.pendingDrivers[InnerDriver.name].map(drv => drv.driverData);
        this.pendingDrivers[InnerDriver.name].push(d);
      });

      try {
        [innerSessionId, dCaps] = await d.createSession(processedJsonwpCapabilities, reqCaps, processedW3CCapabilities, [...runningDriversData, ...otherPendingDriversData]);
        protocol = d.protocol;
        await sessionsListGuard.acquire(AppiumDriver.name, () => {
          this.sessions[innerSessionId] = d;
        });
      } finally {
        await pendingDriversGuard.acquire(AppiumDriver.name, () => {
          _lodash.default.pull(this.pendingDrivers[InnerDriver.name], d);
        });
      }

      this.attachUnexpectedShutdownHandler(d, innerSessionId);

      _logger.default.info(`New ${InnerDriver.name} session created successfully, session ` + `${innerSessionId} added to master session list`);

      d.startNewCommandTimeout();

      if (d.isW3CProtocol() && !_lodash.default.isEmpty(w3cSettings)) {
        _logger.default.info(`Applying the initial values to Appium settings parsed from W3C caps: ` + JSON.stringify(w3cSettings));

        await d.updateSettings(w3cSettings);
      } else if (d.isMjsonwpProtocol() && !_lodash.default.isEmpty(jwpSettings)) {
        _logger.default.info(`Applying the initial values to Appium settings parsed from MJSONWP caps: ` + JSON.stringify(jwpSettings));

        await d.updateSettings(jwpSettings);
      }
    } catch (error) {
      return {
        protocol,
        error
      };
    }

    return {
      protocol,
      value: [innerSessionId, dCaps, protocol]
    };
  }

  async attachUnexpectedShutdownHandler(driver, innerSessionId) {
    try {
      await driver.onUnexpectedShutdown;
      throw new Error('Unexpected shutdown');
    } catch (e) {
      if (e instanceof _bluebird.default.CancellationError) {
        return;
      }

      _logger.default.warn(`Closing session, cause was '${e.message}'`);

      _logger.default.info(`Removing session ${innerSessionId} from our master session list`);

      await sessionsListGuard.acquire(AppiumDriver.name, () => {
        delete this.sessions[innerSessionId];
      });
    }
  }

  async curSessionDataForDriver(InnerDriver) {
    const sessions = await sessionsListGuard.acquire(AppiumDriver.name, () => this.sessions);

    const data = _lodash.default.values(sessions).filter(s => s.constructor.name === InnerDriver.name).map(s => s.driverData);

    for (let datum of data) {
      if (!datum) {
        throw new Error(`Problem getting session data for driver type ` + `${InnerDriver.name}; does it implement 'get ` + `driverData'?`);
      }
    }

    return data;
  }

  async deleteSession(sessionId) {
    let protocol;

    try {
      let otherSessionsData = null;
      let dstSession = null;
      await sessionsListGuard.acquire(AppiumDriver.name, () => {
        if (!this.sessions[sessionId]) {
          return;
        }

        const curConstructorName = this.sessions[sessionId].constructor.name;
        otherSessionsData = _lodash.default.toPairs(this.sessions).filter(([key, value]) => value.constructor.name === curConstructorName && key !== sessionId).map(([, value]) => value.driverData);
        dstSession = this.sessions[sessionId];
        protocol = dstSession.protocol;

        _logger.default.info(`Removing session ${sessionId} from our master session list`);

        delete this.sessions[sessionId];
      });
      return {
        protocol,
        value: await dstSession.deleteSession(sessionId, otherSessionsData)
      };
    } catch (e) {
      _logger.default.error(`Had trouble ending session ${sessionId}: ${e.message}`);

      return {
        protocol,
        error: e
      };
    }
  }

  async executeCommand(cmd, ...args) {
    if (cmd === 'getStatus') {
      return await this.getStatus();
    }

    if (isAppiumDriverCommand(cmd)) {
      return await super.executeCommand(cmd, ...args);
    }

    const sessionId = _lodash.default.last(args);

    const dstSession = await sessionsListGuard.acquire(AppiumDriver.name, () => this.sessions[sessionId]);

    if (!dstSession) {
      throw new Error(`The session with id '${sessionId}' does not exist`);
    }

    let res = {
      protocol: dstSession.protocol
    };

    try {
      res.value = await dstSession.executeCommand(cmd, ...args);
    } catch (e) {
      res.error = e;
    }

    return res;
  }

  proxyActive(sessionId) {
    const dstSession = this.sessions[sessionId];
    return dstSession && _lodash.default.isFunction(dstSession.proxyActive) && dstSession.proxyActive(sessionId);
  }

  getProxyAvoidList(sessionId) {
    const dstSession = this.sessions[sessionId];
    return dstSession ? dstSession.getProxyAvoidList() : [];
  }

  canProxy(sessionId) {
    const dstSession = this.sessions[sessionId];
    return dstSession && dstSession.canProxy(sessionId);
  }

}

exports.AppiumDriver = AppiumDriver;

function isAppiumDriverCommand(cmd) {
  return !(0, _appiumBaseDriver.isSessionCommand)(cmd) || cmd === 'deleteSession';
}require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9hcHBpdW0uanMiXSwibmFtZXMiOlsiUExBVEZPUk1TIiwiRkFLRSIsIkFORFJPSUQiLCJJT1MiLCJBUFBMRV9UVk9TIiwiV0lORE9XUyIsIk1BQyIsIlRJWkVOIiwiQVVUT01BVElPTl9OQU1FUyIsIkFQUElVTSIsIlVJQVVUT01BVE9SMiIsIlVJQVVUT01BVE9SMSIsIlhDVUlURVNUIiwiWU9VSUVOR0lORSIsIkVTUFJFU1NPIiwiSU5TVFJVTUVOVFMiLCJEUklWRVJfTUFQIiwidG9Mb3dlckNhc2UiLCJkcml2ZXJDbGFzc05hbWUiLCJkcml2ZXJQYWNrYWdlIiwiUExBVEZPUk1TX01BUCIsImxvZ0RpdmlkZXJMZW5ndGgiLCJhdXRvbWF0aW9uV2FybmluZyIsImRpdmlkZXIiLCJFT0wiLCJfIiwicmVwZWF0IiwiYXV0b21hdGlvbldhcm5pbmdTdHJpbmciLCJsb2ciLCJ3aWR0aCIsIndhcm4iLCJjYXBzIiwicGxhdGZvcm1WZXJzaW9uIiwic2VtdmVyIiwidmFsaWQiLCJjb2VyY2UiLCJzYXRpc2ZpZXMiLCJpbmZvIiwiZGVzaXJlZENhcGFiaWxpdHlDb25zdHJhaW50cyIsImF1dG9tYXRpb25OYW1lIiwicHJlc2VuY2UiLCJpc1N0cmluZyIsImluY2x1c2lvbkNhc2VJbnNlbnNpdGl2ZSIsInZhbHVlcyIsInBsYXRmb3JtTmFtZSIsImtleXMiLCJzZXNzaW9uc0xpc3RHdWFyZCIsIkFzeW5jTG9jayIsInBlbmRpbmdEcml2ZXJzR3VhcmQiLCJBcHBpdW1Ecml2ZXIiLCJCYXNlRHJpdmVyIiwiY29uc3RydWN0b3IiLCJhcmdzIiwidG1wRGlyIiwicHJvY2VzcyIsImVudiIsIkFQUElVTV9UTVBfRElSIiwiZGVzaXJlZENhcENvbnN0cmFpbnRzIiwibmV3Q29tbWFuZFRpbWVvdXRNcyIsIk9iamVjdCIsImFzc2lnbiIsInNlc3Npb25zIiwicGVuZGluZ0RyaXZlcnMiLCJpc0NvbW1hbmRzUXVldWVFbmFibGVkIiwic2Vzc2lvbkV4aXN0cyIsInNlc3Npb25JZCIsImRzdFNlc3Npb24iLCJkcml2ZXJGb3JTZXNzaW9uIiwiZ2V0RHJpdmVyQW5kVmVyc2lvbkZvckNhcHMiLCJFcnJvciIsImF1dG9tYXRpb25OYW1lQ2FwIiwiZHJpdmVyU2VsZWN0b3IiLCJkcml2ZXIiLCJyZXF1aXJlIiwidmVyc2lvbiIsImdldERyaXZlclZlcnNpb24iLCJuYW1lIiwiaWduIiwibXNnIiwiZHJpdmVyTmFtZSIsImdldFN0YXR1cyIsImJ1aWxkIiwiY2xvbmUiLCJnZXRTZXNzaW9ucyIsImFjcXVpcmUiLCJ0b1BhaXJzIiwibWFwIiwiaWQiLCJjYXBhYmlsaXRpZXMiLCJwcmludE5ld1Nlc3Npb25Bbm5vdW5jZW1lbnQiLCJkcml2ZXJWZXJzaW9uIiwiaW50cm9TdHJpbmciLCJBUFBJVU1fVkVSIiwiY3JlYXRlU2Vzc2lvbiIsImpzb253cENhcHMiLCJyZXFDYXBzIiwidzNjQ2FwYWJpbGl0aWVzIiwiZGVmYXVsdENhcGFiaWxpdGllcyIsImNsb25lRGVlcCIsImRlZmF1bHRTZXR0aW5ncyIsImp3cFNldHRpbmdzIiwidzNjU2V0dGluZ3MiLCJhbHdheXNNYXRjaCIsImZpcnN0TWF0Y2hFbnRyeSIsImZpcnN0TWF0Y2giLCJwcm90b2NvbCIsImlubmVyU2Vzc2lvbklkIiwiZENhcHMiLCJwYXJzZWRDYXBzIiwiZGVzaXJlZENhcHMiLCJwcm9jZXNzZWRKc29ud3BDYXBhYmlsaXRpZXMiLCJwcm9jZXNzZWRXM0NDYXBhYmlsaXRpZXMiLCJlcnJvciIsIklubmVyRHJpdmVyIiwic2Vzc2lvbk92ZXJyaWRlIiwic2Vzc2lvbklkc1RvRGVsZXRlIiwibGVuZ3RoIiwiQiIsImRlbGV0ZVNlc3Npb24iLCJydW5uaW5nRHJpdmVyc0RhdGEiLCJvdGhlclBlbmRpbmdEcml2ZXJzRGF0YSIsImQiLCJyZWxheGVkU2VjdXJpdHlFbmFibGVkIiwiaXNFbXB0eSIsImRlbnlJbnNlY3VyZSIsImEiLCJhbGxvd0luc2VjdXJlIiwic2VydmVyIiwiY3VyU2Vzc2lvbkRhdGFGb3JEcml2ZXIiLCJlIiwiZXJyb3JzIiwiU2Vzc2lvbk5vdENyZWF0ZWRFcnJvciIsIm1lc3NhZ2UiLCJkcnYiLCJkcml2ZXJEYXRhIiwicHVzaCIsInB1bGwiLCJhdHRhY2hVbmV4cGVjdGVkU2h1dGRvd25IYW5kbGVyIiwic3RhcnROZXdDb21tYW5kVGltZW91dCIsImlzVzNDUHJvdG9jb2wiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlU2V0dGluZ3MiLCJpc01qc29ud3BQcm90b2NvbCIsInZhbHVlIiwib25VbmV4cGVjdGVkU2h1dGRvd24iLCJDYW5jZWxsYXRpb25FcnJvciIsImRhdGEiLCJmaWx0ZXIiLCJzIiwiZGF0dW0iLCJvdGhlclNlc3Npb25zRGF0YSIsImN1ckNvbnN0cnVjdG9yTmFtZSIsImtleSIsImV4ZWN1dGVDb21tYW5kIiwiY21kIiwiaXNBcHBpdW1Ecml2ZXJDb21tYW5kIiwibGFzdCIsInJlcyIsInByb3h5QWN0aXZlIiwiaXNGdW5jdGlvbiIsImdldFByb3h5QXZvaWRMaXN0IiwiY2FuUHJveHkiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0EsTUFBTUEsU0FBUyxHQUFHO0FBQ2hCQyxFQUFBQSxJQUFJLEVBQUUsTUFEVTtBQUVoQkMsRUFBQUEsT0FBTyxFQUFFLFNBRk87QUFHaEJDLEVBQUFBLEdBQUcsRUFBRSxLQUhXO0FBSWhCQyxFQUFBQSxVQUFVLEVBQUUsTUFKSTtBQUtoQkMsRUFBQUEsT0FBTyxFQUFFLFNBTE87QUFNaEJDLEVBQUFBLEdBQUcsRUFBRSxLQU5XO0FBT2hCQyxFQUFBQSxLQUFLLEVBQUU7QUFQUyxDQUFsQjtBQVVBLE1BQU1DLGdCQUFnQixHQUFHO0FBQ3ZCQyxFQUFBQSxNQUFNLEVBQUUsUUFEZTtBQUV2QkMsRUFBQUEsWUFBWSxFQUFFLGNBRlM7QUFHdkJDLEVBQUFBLFlBQVksRUFBRSxjQUhTO0FBSXZCQyxFQUFBQSxRQUFRLEVBQUUsVUFK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O1xuaW1wb3J0IHsgZ2V0QnVpbGRJbmZvLCB1cGRhdGVCdWlsZEluZm8sIEFQUElVTV9WRVIgfSBmcm9tICcuL2NvbmZpZyc7XG5pbXBvcnQgeyBCYXNlRHJpdmVyLCBlcnJvcnMsIGlzU2Vzc2lvbkNvbW1hbmQgfSBmcm9tICdhcHBpdW0tYmFzZS1kcml2ZXInO1xuaW1wb3J0IEIgZnJvbSAnYmx1ZWJpcmQnO1xuaW1wb3J0IEFzeW5jTG9jayBmcm9tICdhc3luYy1sb2NrJztcbmltcG9ydCB7IHBhcnNlQ2Fwc0ZvcklubmVyRHJpdmVyLCBnZXRQYWNrYWdlVmVyc2lvbiwgcHVsbFNldHRpbmdzIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgc2VtdmVyIGZyb20gJ3NlbXZlcic7XG5pbXBvcnQgd3JhcCBmcm9tICd3b3JkLXdyYXAnO1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnO1xuXG5cbmNvbnN0IFBMQVRGT1JNUyA9IHtcbiAgRkFLRTogJ2Zha2UnLFxuICBBTkRST0lEOiAnYW5kcm9pZCcsXG4gIElPUzogJ2lvcycsXG4gIEFQUExFX1RWT1M6ICd0dm9zJyxcbiAgV0lORE9XUzogJ3dpbmRvd3MnLFxuICBNQUM6ICdtYWMnLFxuICBUSVpFTjogJ3RpemVuJyxcbn07XG5cbmNvbnN0IEFVVE9NQVRJT05fTkFNRVMgPSB7XG4gIEFQUElVTTogJ0FwcGl1bScsXG4gIFVJQVVUT01BVE9SMjogJ1VpQXV0b21hdG9yMicsXG4gIFVJQVVUT01BVE9SMTogJ1VpQXV0b21hdG9yMScsXG4gIFhDVUlURVNUOiAnWENVSVRlc3QnLFxuICBZT1VJRU5HSU5FOiAnWW91aUVuZ2luZScsXG4gIEVTUFJFU1NPOiAnRXNwcmVzc28nLFxuICBUSVpFTjogJ1RpemVuJyxcbiAgRkFLRTogJ0Zha2UnLFxuICBJTlNUUlVNRU5UUzogJ0luc3RydW1lbnRzJyxcbiAgV0lORE9XUzogJ1dpbmRvd3MnLFxuICBNQUM6ICdNYWMnLFxufTtcbmNvbnN0IERSSVZFUl9NQVAgPSB7XG4gIFtBVVRPTUFUSU9OX05BTUVTLlVJQVVUT01BVE9SMi50b0xvd2VyQ2FzZSgpXToge1xuICAgIGRyaXZlckNsYXNzTmFtZTogJ0FuZHJvaWRVaWF1dG9tYXRvcjJEcml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0tdWlhdXRvbWF0b3IyLWRyaXZlcicsXG4gIH0sXG4gIFtBVVRPTUFUSU9OX05BTUVTLlhDVUlURVNULnRvTG93ZXJDYXNlKCldOiB7XG4gICAgZHJpdmVyQ2xhc3NOYW1lOiAnWENVSVRlc3REcml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0teGN1aXRlc3QtZHJpdmVyJyxcbiAgfSxcbiAgW0FVVE9NQVRJT05fTkFNRVMuWU9VSUVOR0lORS50b0xvd2VyQ2FzZSgpXToge1xuICAgIGRyaXZlckNsYXNzTmFtZTogJ1lvdWlFbmdpbmVEcml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0teW91aWVuZ2luZS1kcml2ZXInLFxuICB9LFxuICBbQVVUT01BVElPTl9OQU1FUy5GQUtFLnRvTG93ZXJDYXNlKCldOiB7XG4gICAgZHJpdmVyQ2xhc3NOYW1lOiAnRmFrZURyaXZlcicsXG4gICAgZHJpdmVyUGFja2FnZTogJ2FwcGl1bS1mYWtlLWRyaXZlcicsXG4gIH0sXG4gIFtBVVRPTUFUSU9OX05BTUVTLlVJQVVUT01BVE9SMS50b0xvd2VyQ2FzZSgpXToge1xuICAgIGRyaXZlckNsYXNzTmFtZTogJ0FuZHJvaWREcml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0tYW5kcm9pZC1kcml2ZXInLFxuICB9LFxuICBbQVVUT01BVElPTl9OQU1FUy5JTlNUUlVNRU5UUy50b0xvd2VyQ2FzZSgpXToge1xuICAgIGRyaXZlckNsYXNzTmFtZTogJ0lvc0RyaXZlcicsXG4gICAgZHJpdmVyUGFja2FnZTogJ2FwcGl1bS1pb3MtZHJpdmVyJyxcbiAgfSxcbiAgW0FVVE9NQVRJT05fTkFNRVMuV0lORE9XUy50b0xvd2VyQ2FzZSgpXToge1xuICAgIGRyaXZlckNsYXNzTmFtZTogJ1dpbmRvd3NEcml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0td2luZG93cy1kcml2ZXInLFxuICB9LFxuICBbQVVUT01BVElPTl9OQU1FUy5NQUMudG9Mb3dlckNhc2UoKV06IHtcbiAgICBkcml2ZXJDbGFzc05hbWU6ICdNYWNEcml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0tbWFjLWRyaXZlcicsXG4gIH0sXG4gIFtBVVRPTUFUSU9OX05BTUVTLkVTUFJFU1NPLnRvTG93ZXJDYXNlKCldOiB7XG4gICAgZHJpdmVyQ2xhc3NOYW1lOiAnRXNwcmVzc29Ecml2ZXInLFxuICAgIGRyaXZlclBhY2thZ2U6ICdhcHBpdW0tZXNwcmVzc28tZHJpdmVyJyxcbiAgfSxcbiAgW0FVVE9NQVRJT05fTkFNRVMuVElaRU4udG9Mb3dlckNhc2UoKV06IHtcbiAgICBkcml2ZXJDbGFzc05hbWU6ICdUaXplbkRyaXZlcicsXG4gICAgZHJpdmVyUGFja2FnZTogJ2FwcGl1bS10aXplbi1kcml2ZXInLFxuICB9LFxufTtcblxuY29uc3QgUExBVEZPUk1TX01BUCA9IHtcbiAgW1BMQVRGT1JNUy5GQUtFXTogKCkgPT4gQVVUT01BVElPTl9OQU1FUy5GQUtFLFxuICBbUExBVEZPUk1TLkFORFJPSURdOiAoKSA9PiB7XG4gICAgLy8gV2FybiB1c2VycyB0aGF0IGRlZmF1bHQgYXV0b21hdGlvbiBpcyBnb2luZyB0byBjaGFuZ2UgdG8gVWlBdXRvbWF0b3IyIGZvciAxLjE0XG4gICAgLy8gYW5kIHdpbGwgYmVjb21lIHJlcXVpcmVkIG9uIEFwcGl1bSAyLjBcbiAgICBjb25zdCBsb2dEaXZpZGVyTGVuZ3RoID0gNzA7IC8vIEZpdCBpbiBjb21tYW5kIGxpbmVcblxuICAgIGNvbnN0IGF1dG9tYXRpb25XYXJuaW5nID0gW1xuICAgICAgYFRoZSAnYXV0b21hdGlvbk5hbWUnIGNhcGFiaWxpdHkgd2FzIG5vdCBwcm92aWRlZCBpbiB0aGUgZGVzaXJlZCBjYXBhYmlsaXRpZXMgZm9yIHRoaXMgQW5kcm9pZCBzZXNzaW9uYCxcbiAgICAgIGBTZXR0aW5nICdhdXRvbWF0aW9uTmFtZT1VaUF1dG9tYXRvcjInIGJ5IGRlZmF1bHQgYW5kIHVzaW5nIHRoZSBVaUF1dG9tYXRvcjIgRHJpdmVyYCxcbiAgICAgIGBUaGUgbmV4dCBtYWpvciB2ZXJzaW9uIG9mIEFwcGl1bSAoMi54KSB3aWxsICoqcmVxdWlyZSoqIHRoZSAnYXV0b21hdGlvbk5hbWUnIGNhcGFiaWxpdHkgdG8gYmUgc2V0IGZvciBhbGwgc2Vzc2lvbnMgb24gYWxsIHBsYXRmb3Jtc2AsXG4gICAgICBgSW4gcHJldmlvdXMgdmVyc2lvbnMgKEFwcGl1bSA8PSAxLjEzLngpLCB0aGUgZGVmYXVsdCB3YXMgJ2F1dG9tYXRpb25OYW1lPVVpQXV0b21hdG9yMSdgLFxuICAgICAgYElmIHlvdSB3aXNoIHRvIHVzZSB0aGF0IGF1dG9tYXRpb24gaW5zdGVhZCBvZiBVaUF1dG9tYXRvcjIsIHBsZWFzZSBhZGQgJ2F1dG9tYXRpb25OYW1lPVVpQXV0b21hdG9yMScgdG8geW91ciBkZXNpcmVkIGNhcGFiaWxpdGllc2AsXG4gICAgICBgRm9yIG1vcmUgaW5mb3JtYXRpb24gYWJvdXQgZHJpdmVycywgcGxlYXNlIHZpc2l0IGh0dHA6Ly9hcHBpdW0uaW8vZG9jcy9lbi9hYm91dC1hcHBpdW0vaW50cm8vIGFuZCBleHBsb3JlIHRoZSAnRHJpdmVycycgbWVudWBcbiAgICBdO1xuXG4gICAgbGV0IGRpdmlkZXIgPSBgJHtFT0x9JHtfLnJlcGVhdCgnPScsIGxvZ0RpdmlkZXJMZW5ndGgpfSR7RU9MfWA7XG4gICAgbGV0IGF1dG9tYXRpb25XYXJuaW5nU3RyaW5nID0gZGl2aWRlcjtcbiAgICBhdXRvbWF0aW9uV2FybmluZ1N0cmluZyArPSBgICBERVBSRUNBVElPTiBXQVJOSU5HOmAgKyBFT0w7XG4gICAgZm9yIChsZXQgbG9nIG9mIGF1dG9tYXRpb25XYXJuaW5nKSB7XG4gICAgICBhdXRvbWF0aW9uV2FybmluZ1N0cmluZyArPSBFT0wgKyB3cmFwKGxvZywge3dpZHRoOiBsb2dEaXZpZGVyTGVuZ3RoIC0gMn0pICsgRU9MO1xuICAgIH1cbiAgICBhdXRvbWF0aW9uV2FybmluZ1N0cmluZyArPSBkaXZpZGVyO1xuXG4gICAgLy8gUmVjb21tZW5kIHVzZXJzIHRvIHVwZ3JhZGUgdG8gVWlBdXRvbWF0b3IyIGlmIHRoZXkncmUgdXNpbmcgQW5kcm9pZCA+PSA2XG4gICAgbG9nLndhcm4oYXV0b21hdGlvbldhcm5pbmdTdHJpbmcpO1xuXG4gICAgcmV0dXJuIEFVVE9NQVRJT05fTkFNRVMuVUlBVVRPTUFUT1IyO1xuICB9LFxuICBbUExBVEZPUk1TLklPU106IChjYXBzKSA9PiB7XG4gICAgY29uc3QgcGxhdGZvcm1WZXJzaW9uID0gc2VtdmVyLnZhbGlkKHNlbXZlci5jb2VyY2UoY2Fwcy5wbGF0Zm9ybVZlcnNpb24pKTtcbiAgICBsb2cud2FybihgRGVwcmVjYXRpb25XYXJuaW5nOiAnYXV0b21hdGlvbk5hbWUnIGNhcGFiaWxpdHkgd2FzIG5vdCBwcm92aWRlZC4gYCArXG4gICAgICBgRnV0dXJlIHZlcnNpb25zIG9mIEFwcGl1bSB3aWxsIHJlcXVpcmUgJ2F1dG9tYXRpb25OYW1lJyBjYXBhYmlsaXR5IHRvIGJlIHNldCBmb3IgaU9TIHNlc3Npb25zLmApO1xuICAgIGlmIChwbGF0Zm9ybVZlcnNpb24gJiYgc2VtdmVyLnNhdGlzZmllcyhwbGF0Zm9ybVZlcnNpb24sICc+PTEwLjAuMCcpKSB7XG4gICAgICBsb2cuaW5mbygnUmVxdWVzdGVkIGlPUyBzdXBwb3J0IHdpdGggdmVyc2lvbiA+PSAxMCwgJyArXG4gICAgICAgIGB1c2luZyAnJHtBVVRPTUFUSU9OX05BTUVTLlhDVUlURVNUfScgYCArXG4gICAgICAgICdkcml2ZXIgaW5zdGVhZCBvZiBVSUF1dG9tYXRpb24tYmFzZWQgZHJpdmVyLCBzaW5jZSB0aGUgJyArXG4gICAgICAgICdsYXR0ZXIgaXMgdW5zdXBwb3J0ZWQgb24gaU9TIDEwIGFuZCB1cC4nKTtcbiAgICAgIHJldHVybiBBVVRPTUFUSU9OX05BTUVTLlhDVUlURVNUO1xuICAgIH1cblxuICAgIHJldHVybiBBVVRPTUFUSU9OX05BTUVTLklOU1RSVU1FTlRTO1xuICB9LFxuICBbUExBVEZPUk1TLkFQUExFX1RWT1NdOiAoKSA9PiBBVVRPTUFUSU9OX05BTUVTLlhDVUlURVNULFxuICBbUExBVEZPUk1TLldJTkRPV1NdOiAoKSA9PiBBVVRPTUFUSU9OX05BTUVTLldJTkRPV1MsXG4gIFtQTEFURk9STVMuTUFDXTogKCkgPT4gQVVUT01BVElPTl9OQU1FUy5NQUMsXG4gIFtQTEFURk9STVMuVElaRU5dOiAoKSA9PiBBVVRPTUFUSU9OX05BTUVTLlRJWkVOLFxufTtcblxuY29uc3QgZGVzaXJlZENhcGFiaWxpdHlDb25zdHJhaW50cyA9IHtcbiAgYXV0b21hdGlvbk5hbWU6IHtcbiAgICBwcmVzZW5jZTogZmFsc2UsXG4gICAgaXNTdHJpbmc6IHRydWUsXG4gICAgaW5jbHVzaW9uQ2FzZUluc2Vuc2l0aXZlOiBfLnZhbHVlcyhBVVRPTUFUSU9OX05BTUVTKSxcbiAgfSxcbiAgcGxhdGZvcm1OYW1lOiB7XG4gICAgcHJlc2VuY2U6IHRydWUsXG4gICAgaXNTdHJpbmc6IHRydWUsXG4gICAgaW5jbHVzaW9uQ2FzZUluc2Vuc2l0aXZlOiBfLmtleXMoUExBVEZPUk1TX01BUCksXG4gIH0sXG59O1xuXG5jb25zdCBzZXNzaW9uc0xpc3RHdWFyZCA9IG5ldyBBc3luY0xvY2soKTtcbmNvbnN0IHBlbmRpbmdEcml2ZXJzR3VhcmQgPSBuZXcgQXN5bmNMb2NrKCk7XG5cbmNsYXNzIEFwcGl1bURyaXZlciBleHRlbmRzIEJhc2VEcml2ZXIge1xuICBjb25zdHJ1Y3RvciAoYXJncykge1xuICAgIC8vIEl0IGlzIG5lY2Vzc2FyeSB0byBzZXQgYC0tdG1wYCBoZXJlIHNpbmNlIGl0IHNob3VsZCBiZSBzZXQgdG9cbiAgICAvLyBwcm9jZXNzLmVudi5BUFBJVU1fVE1QX0RJUiBvbmNlIGF0IGFuIGluaXRpYWwgcG9pbnQgaW4gdGhlIEFwcGl1bSBsaWZlY3ljbGUuXG4gICAgLy8gVGhlIHByb2Nlc3MgYXJndW1lbnQgd2lsbCBiZSByZWZlcmVuY2VkIGJ5IEJhc2VEcml2ZXIuXG4gICAgLy8gUGxlYXNlIGNhbGwgYXBwaXVtLXN1cHBvcnQudGVtcERpciBtb2R1bGUgdG8gYXBwbHkgdGhpcyBiZW5lZml0LlxuICAgIGlmIChhcmdzLnRtcERpcikge1xuICAgICAgcHJvY2Vzcy5lbnYuQVBQSVVNX1RNUF9ESVIgPSBhcmdzLnRtcERpcjtcbiAgICB9XG5cbiAgICBzdXBlcihhcmdzKTtcblxuICAgIHRoaXMuZGVzaXJlZENhcENvbnN0cmFpbnRzID0gZGVzaXJlZENhcGFiaWxpdHlDb25zdHJhaW50cztcblxuICAgIC8vIHRoZSBtYWluIEFwcGl1bSBEcml2ZXIgaGFzIG5vIG5ldyBjb21tYW5kIHRpbWVvdXRcbiAgICB0aGlzLm5ld0NvbW1hbmRUaW1lb3V0TXMgPSAwO1xuXG4gICAgdGhpcy5hcmdzID0gT2JqZWN0LmFzc2lnbih7fSwgYXJncyk7XG5cbiAgICAvLyBBY2Nlc3MgdG8gc2Vzc2lvbnMgbGlzdCBtdXN0IGJlIGd1YXJkZWQgd2l0aCBhIFNlbWFwaG9yZSwgYmVjYXVzZVxuICAgIC8vIGl0IG1pZ2h0IGJlIGNoYW5nZWQgYnkgb3RoZXIgYXN5bmMgY2FsbHMgYXQgYW55IHRpbWVcbiAgICAvLyBJdCBpcyBub3QgcmVjb21tZW5kZWQgdG8gYWNjZXNzIHRoaXMgcHJvcGVydHkgZGlyZWN0bHkgZnJvbSB0aGUgb3V0c2lkZVxuICAgIHRoaXMuc2Vzc2lvbnMgPSB7fTtcblxuICAgIC8vIEFjY2VzcyB0byBwZW5kaW5nIGRyaXZlcnMgbGlzdCBtdXN0IGJlIGd1YXJkZWQgd2l0aCBhIFNlbWFwaG9yZSwgYmVjYXVzZVxuICAgIC8vIGl0IG1pZ2h0IGJlIGNoYW5nZWQgYnkgb3RoZXIgYXN5bmMgY2FsbHMgYXQgYW55IHRpbWVcbiAgICAvLyBJdCBpcyBub3QgcmVjb21tZW5kZWQgdG8gYWNjZXNzIHRoaXMgcHJvcGVydHkgZGlyZWN0bHkgZnJvbSB0aGUgb3V0c2lkZVxuICAgIHRoaXMucGVuZGluZ0RyaXZlcnMgPSB7fTtcblxuICAgIC8vIGFsbG93IHRoaXMgdG8gaGFwcGVuIGluIHRoZSBiYWNrZ3JvdW5kLCBzbyBubyBgYXdhaXRgXG4gICAgdXBkYXRlQnVpbGRJbmZvKCk7XG4gIH1cblxuICAvKipcbiAgICogQ2FuY2VsIGNvbW1hbmRzIHF1ZXVlaW5nIGZvciB0aGUgdW1icmVsbGEgQXBwaXVtIGRyaXZlclxuICAgKi9cbiAgZ2V0IGlzQ29tbWFuZHNRdWV1ZUVuYWJsZWQgKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHNlc3Npb25FeGlzdHMgKHNlc3Npb25JZCkge1xuICAgIGNvbnN0IGRzdFNlc3Npb24gPSB0aGlzLnNlc3Npb25zW3Nlc3Npb25JZF07XG4gICAgcmV0dXJuIGRzdFNlc3Npb24gJiYgZHN0U2Vzc2lvbi5zZXNzaW9uSWQgIT09IG51bGw7XG4gIH1cblxuICBkcml2ZXJGb3JTZXNzaW9uIChzZXNzaW9uSWQpIHtcbiAgICByZXR1cm4gdGhpcy5zZXNzaW9uc1tzZXNzaW9uSWRdO1xuICB9XG5cbiAgZ2V0RHJpdmVyQW5kVmVyc2lvbkZvckNhcHMgKGNhcHMpIHtcbiAgICBpZiAoIV8uaXNTdHJpbmcoY2Fwcy5wbGF0Zm9ybU5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGluY2x1ZGUgYSBwbGF0Zm9ybU5hbWUgY2FwYWJpbGl0eScpO1xuICAgIH1cblxuICAgIGNvbnN0IHBsYXRmb3JtTmFtZSA9IGNhcHMucGxhdGZvcm1OYW1lLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAvLyB3ZSBkb24ndCBuZWNlc3NhcmlseSBoYXZlIGFuIGBhdXRvbWF0aW9uTmFtZWAgY2FwYWJpbGl0eVxuICAgIGxldCBhdXRvbWF0aW9uTmFtZUNhcCA9IGNhcHMuYXV0b21hdGlvbk5hbWU7XG4gICAgaWYgKCFfLmlzU3RyaW5nKGF1dG9tYXRpb25OYW1lQ2FwKSB8fCBhdXRvbWF0aW9uTmFtZUNhcC50b0xvd2VyQ2FzZSgpID09PSAnYXBwaXVtJykge1xuICAgICAgY29uc3QgZHJpdmVyU2VsZWN0b3IgPSBQTEFURk9STVNfTUFQW3BsYXRmb3JtTmFtZV07XG4gICAgICBpZiAoZHJpdmVyU2VsZWN0b3IpIHtcbiAgICAgICAgYXV0b21hdGlvbk5hbWVDYXAgPSBkcml2ZXJTZWxlY3RvcihjYXBzKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXV0b21hdGlvbk5hbWVDYXAgPSBhdXRvbWF0aW9uTmFtZUNhcC50b0xvd2VyQ2FzZSgpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHtkcml2ZXJQYWNrYWdlLCBkcml2ZXJDbGFzc05hbWV9ID0gRFJJVkVSX01BUFthdXRvbWF0aW9uTmFtZUNhcF07XG4gICAgICBjb25zdCBkcml2ZXIgPSByZXF1aXJlKGRyaXZlclBhY2thZ2UpW2RyaXZlckNsYXNzTmFtZV07XG4gICAgICByZXR1cm4ge1xuICAgICAgICBkcml2ZXIsXG4gICAgICAgIHZlcnNpb246IHRoaXMuZ2V0RHJpdmVyVmVyc2lvbihkcml2ZXIubmFtZSwgZHJpdmVyUGFja2FnZSksXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGlnbikge1xuICAgICAgLy8gZXJyb3Igd2lsbCBiZSByZXBvcnRlZCBiZWxvdywgYW5kIGhlcmUgd291bGQgY29tZSBvdXQgYXMgYW4gdW5jbGVhclxuICAgICAgLy8gcHJvYmxlbSB3aXRoIGRlc3RydWN0dXJpbmcgdW5kZWZpbmVkXG4gICAgfVxuXG4gICAgY29uc3QgbXNnID0gXy5pc1N0cmluZyhjYXBzLmF1dG9tYXRpb25OYW1lKVxuICAgICAgPyBgQ291bGQgbm90IGZpbmQgYSBkcml2ZXIgZm9yIGF1dG9tYXRpb25OYW1lICcke2NhcHMuYXV0b21hdGlvbk5hbWV9JyBhbmQgcGxhdGZvcm1OYW1lIGAgK1xuICAgICAgICAgICAgYCcke2NhcHMucGxhdGZvcm1OYW1lfScuYFxuICAgICAgOiBgQ291bGQgbm90IGZpbmQgYSBkcml2ZXIgZm9yIHBsYXRmb3JtTmFtZSAnJHtjYXBzLnBsYXRmb3JtTmFtZX0nLmA7XG4gICAgdGhyb3cgbmV3IEVycm9yKGAke21zZ30gUGxlYXNlIGNoZWNrIHlvdXIgZGVzaXJlZCBjYXBhYmlsaXRpZXMuYCk7XG4gIH1cblxuICBnZXREcml2ZXJWZXJzaW9uIChkcml2ZXJOYW1lLCBkcml2ZXJQYWNrYWdlKSB7XG4gICAgY29uc3QgdmVyc2lvbiA9IGdldFBhY2thZ2VWZXJzaW9uKGRyaXZlclBhY2thZ2UpO1xuICAgIGlmICh2ZXJzaW9uKSB7XG4gICAgICByZXR1cm4gdmVyc2lvbjtcbiAgICB9XG4gICAgbG9nLndhcm4oYFVuYWJsZSB0byBnZXQgdmVyc2lvbiBvZiBkcml2ZXIgJyR7ZHJpdmVyTmFtZX0nYCk7XG4gIH1cblxuICBhc3luYyBnZXRTdGF0dXMgKCkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIHJlcXVpcmUtYXdhaXRcbiAgICByZXR1cm4ge1xuICAgICAgYnVpbGQ6IF8uY2xvbmUoZ2V0QnVpbGRJbmZvKCkpLFxuICAgIH07XG4gIH1cblxuICBhc3luYyBnZXRTZXNzaW9ucyAoKSB7XG4gICAgY29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBzZXNzaW9uc0xpc3RHdWFyZC5hY3F1aXJlKEFwcGl1bURyaXZlci5uYW1lLCAoKSA9PiB0aGlzLnNlc3Npb25zKTtcbiAgICByZXR1cm4gXy50b1BhaXJzKHNlc3Npb25zKVxuICAgICAgLm1hcCgoW2lkLCBkcml2ZXJdKSA9PiB7XG4gICAgICAgIHJldHVybiB7aWQsIGNhcGFiaWxpdGllczogZHJpdmVyLmNhcHN9O1xuICAgICAgfSk7XG4gIH1cblxuICBwcmludE5ld1Nlc3Npb25Bbm5vdW5jZW1lbnQgKGRyaXZlck5hbWUsIGRyaXZlclZlcnNpb24pIHtcbiAgICBjb25zdCBpbnRyb1N0cmluZyA9IGRyaXZlclZlcnNpb25cbiAgICAgID8gYEFwcGl1bSB2JHtBUFBJVU1fVkVSfSBjcmVhdGluZyBuZXcgJHtkcml2ZXJOYW1lfSAodiR7ZHJpdmVyVmVyc2lvbn0pIHNlc3Npb25gXG4gICAgICA6IGBBcHBpdW0gdiR7QVBQSVVNX1ZFUn0gY3JlYXRpbmcgbmV3ICR7ZHJpdmVyTmFtZX0gc2Vzc2lvbmA7XG4gICAgbG9nLmluZm8oaW50cm9TdHJpbmcpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyBzZXNzaW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBqc29ud3BDYXBzIEpTT05XUCBmb3JtYXR0ZWQgZGVzaXJlZCBjYXBhYmlsaXRpZXNcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcUNhcHMgUmVxdWlyZWQgY2FwYWJpbGl0aWVzIChKU09OV1Agc3RhbmRhcmQpXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB3M2NDYXBhYmlsaXRpZXMgVzNDIGNhcGFiaWxpdGllc1xuICAgKiBAcmV0dXJuIHtBcnJheX0gVW5pcXVlIHNlc3Npb24gSUQgYW5kIGNhcGFiaWxpdGllc1xuICAgKi9cbiAgYXN5bmMgY3JlYXRlU2Vzc2lvbiAoanNvbndwQ2FwcywgcmVxQ2FwcywgdzNjQ2FwYWJpbGl0aWVzKSB7XG4gICAgY29uc3QgZGVmYXVsdENhcGFiaWxpdGllcyA9IF8uY2xvbmVEZWVwKHRoaXMuYXJncy5kZWZhdWx0Q2FwYWJpbGl0aWVzKTtcbiAgICBjb25zdCBkZWZhdWx0U2V0dGluZ3MgPSBwdWxsU2V0dGluZ3MoZGVmYXVsdENhcGFiaWxpdGllcyk7XG4gICAganNvbndwQ2FwcyA9IF8uY2xvbmVEZWVwKGpzb253cENhcHMpO1xuICAgIGNvbnN0IGp3cFNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdFNldHRpbmdzLCBwdWxsU2V0dGluZ3MoanNvbndwQ2FwcykpO1xuICAgIHczY0NhcGFiaWxpdGllcyA9IF8uY2xvbmVEZWVwKHczY0NhcGFiaWxpdGllcyk7XG4gICAgLy8gSXQgaXMgcG9zc2libGUgdGhhdCB0aGUgY2xpZW50IG9ubHkgcHJvdmlkZXMgY2FwcyB1c2luZyBKU09OV1Agc3RhbmRhcmQsXG4gICAgLy8gYWx0aG91Z2ggZmlyc3RNYXRjaC9hbHdheXNNYXRjaCBwcm9wZXJ0aWVzIGFyZSBzdGlsbCBwcmVzZW50LlxuICAgIC8vIEluIHN1Y2ggY2FzZSB3ZSBhc3N1bWUgdGhlIGNsaWVudCB1bmRlcnN0YW5kcyBXM0MgcHJvdG9jb2wgYW5kIG1lcmdlIHRoZSBnaXZlblxuICAgIC8vIEpTT05XUCBjYXBzIHRvIFczQyBjYXBzXG4gICAgY29uc3QgdzNjU2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBqd3BTZXR0aW5ncyk7XG4gICAgT2JqZWN0LmFzc2lnbih3M2NTZXR0aW5ncywgcHVsbFNldHRpbmdzKCh3M2NDYXBhYmlsaXRpZXMgfHwge30pLmFsd2F5c01hdGNoIHx8IHt9KSk7XG4gICAgZm9yIChjb25zdCBmaXJzdE1hdGNoRW50cnkgb2YgKCh3M2NDYXBhYmlsaXRpZXMgfHwge30pLmZpcnN0TWF0Y2ggfHwgW10pKSB7XG4gICAgICBPYmplY3QuYXNzaWduKHczY1NldHRpbmdzLCBwdWxsU2V0dGluZ3MoZmlyc3RNYXRjaEVudHJ5KSk7XG4gICAgfVxuXG4gICAgbGV0IHByb3RvY29sO1xuICAgIGxldCBpbm5lclNlc3Npb25JZCwgZENhcHM7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBjYXBzIGludG8gYSBmb3JtYXQgdGhhdCB0aGUgSW5uZXJEcml2ZXIgd2lsbCBhY2NlcHRcbiAgICAgIGNvbnN0IHBhcnNlZENhcHMgPSBwYXJzZUNhcHNGb3JJbm5lckRyaXZlcihcbiAgICAgICAganNvbndwQ2FwcyxcbiAgICAgICAgdzNjQ2FwYWJpbGl0aWVzLFxuICAgICAgICB0aGlzLmRlc2lyZWRDYXBDb25zdHJhaW50cyxcbiAgICAgICAgZGVmYXVsdENhcGFiaWxpdGllc1xuICAgICAgKTtcblxuICAgICAgY29uc3Qge2Rlc2lyZWRDYXBzLCBwcm9jZXNzZWRKc29ud3BDYXBhYmlsaXRpZXMsIHByb2Nlc3NlZFczQ0NhcGFiaWxpdGllcywgZXJyb3J9ID0gcGFyc2VkQ2FwcztcbiAgICAgIHByb3RvY29sID0gcGFyc2VkQ2Fwcy5wcm90b2NvbDtcblxuICAgICAgLy8gSWYgdGhlIHBhcnNpbmcgb2YgdGhlIGNhcHMgcHJvZHVjZWQgYW4gZXJyb3IsIHRocm93IGl0IGluIGhlcmVcbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cblxuICAgICAgY29uc3Qge2RyaXZlcjogSW5uZXJEcml2ZXIsIHZlcnNpb246IGRyaXZlclZlcnNpb259ID0gdGhpcy5nZXREcml2ZXJBbmRWZXJzaW9uRm9yQ2FwcyhkZXNpcmVkQ2Fwcyk7XG4gICAgICB0aGlzLnByaW50TmV3U2Vzc2lvbkFubm91bmNlbWVudChJbm5lckRyaXZlci5uYW1lLCBkcml2ZXJWZXJzaW9uKTtcblxuICAgICAgaWYgKHRoaXMuYXJncy5zZXNzaW9uT3ZlcnJpZGUpIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbklkc1RvRGVsZXRlID0gYXdhaXQgc2Vzc2lvbnNMaXN0R3VhcmQuYWNxdWlyZShBcHBpdW1Ecml2ZXIubmFtZSwgKCkgPT4gXy5rZXlzKHRoaXMuc2Vzc2lvbnMpKTtcbiAgICAgICAgaWYgKHNlc3Npb25JZHNUb0RlbGV0ZS5sZW5ndGgpIHtcbiAgICAgICAgICBsb2cuaW5mbyhgU2Vzc2lvbiBvdmVycmlkZSBpcyBvbi4gRGVsZXRpbmcgb3RoZXIgJHtzZXNzaW9uSWRzVG9EZWxldGUubGVuZ3RofSBhY3RpdmUgc2Vzc2lvbiR7c2Vzc2lvbklkc1RvRGVsZXRlLmxlbmd0aCA/ICcnIDogJ3MnfS5gKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgQi5tYXAoc2Vzc2lvbklkc1RvRGVsZXRlLCAoaWQpID0+IHRoaXMuZGVsZXRlU2Vzc2lvbihpZCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGlnbikge31cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgcnVubmluZ0RyaXZlcnNEYXRhLCBvdGhlclBlbmRpbmdEcml2ZXJzRGF0YTtcbiAgICAgIGNvbnN0IGQgPSBuZXcgSW5uZXJEcml2ZXIodGhpcy5hcmdzKTtcblxuICAgICAgLy8gV2Ugd2FudCB0byBhc3NpZ24gc2VjdXJpdHkgdmFsdWVzIGRpcmVjdGx5IG9uIHRoZSBkcml2ZXIuIFRoZSBkcml2ZXJcbiAgICAgIC8vIHNob3VsZCBub3QgcmVhZCBzZWN1cml0eSB2YWx1ZXMgZnJvbSBgdGhpcy5vcHRzYCBiZWNhdXNlIHRob3NlIHZhbHVlc1xuICAgICAgLy8gY291bGQgaGF2ZSBiZWVuIHNldCBieSBhIG1hbGljaW91cyB1c2VyIHZpYSBjYXBhYmlsaXRpZXMsIHdoZXJlYXMgd2VcbiAgICAgIC8vIHdhbnQgYSBndWFyYW50ZWUgdGhlIHZhbHVlcyB3ZXJlIHNldCBieSB0aGUgYXBwaXVtIHNlcnZlciBhZG1pblxuICAgICAgaWYgKHRoaXMuYXJncy5yZWxheGVkU2VjdXJpdHlFbmFibGVkKSB7XG4gICAgICAgIGxvZy5pbmZvKGBBcHBseWluZyByZWxheGVkIHNlY3VyaXR5IHRvICcke0lubmVyRHJpdmVyLm5hbWV9JyBhcyBwZXIgYCArXG4gICAgICAgICAgICAgICAgIGBzZXJ2ZXIgY29tbWFuZCBsaW5lIGFyZ3VtZW50LiBBbGwgaW5zZWN1cmUgZmVhdHVyZXMgd2lsbCBiZSBgICtcbiAgICAgICAgICAgICAgICAgYGVuYWJsZWQgdW5sZXNzIGV4cGxpY2l0bHkgZGlzYWJsZWQgYnkgLS1kZW55LWluc2VjdXJlYCk7XG4gICAgICAgIGQucmVsYXhlZFNlY3VyaXR5RW5hYmxlZCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghXy5pc0VtcHR5KHRoaXMuYXJncy5kZW55SW5zZWN1cmUpKSB7XG4gICAgICAgIGxvZy5pbmZvKCdFeHBsaWNpdGx5IHByZXZlbnRpbmcgdXNlIG9mIGluc2VjdXJlIGZlYXR1cmVzOicpO1xuICAgICAgICB0aGlzLmFyZ3MuZGVueUluc2VjdXJlLm1hcCgoYSkgPT4gbG9nLmluZm8oYCAgICAke2F9YCkpO1xuICAgICAgICBkLmRlbnlJbnNlY3VyZSA9IHRoaXMuYXJncy5kZW55SW5zZWN1cmU7XG4gICAgICB9XG5cbiAgICAgIGlmICghXy5pc0VtcHR5KHRoaXMuYXJncy5hbGxvd0luc2VjdXJlKSkge1xuICAgICAgICBsb2cuaW5mbygnRXhwbGljaXRseSBlbmFibGluZyB1c2Ugb2YgaW5zZWN1cmUgZmVhdHVyZXM6Jyk7XG4gICAgICAgIHRoaXMuYXJncy5hbGxvd0luc2VjdXJlLm1hcCgoYSkgPT4gbG9nLmluZm8oYCAgICAke2F9YCkpO1xuICAgICAgICBkLmFsbG93SW5zZWN1cmUgPSB0aGlzLmFyZ3MuYWxsb3dJbnNlY3VyZTtcbiAgICAgIH1cblxuICAgICAgLy8gVGhpcyBhc3NpZ25tZW50IGlzIHJlcXVpcmVkIGZvciBjb3JyZWN0IHdlYiBzb2NrZXRzIGZ1bmN0aW9uYWxpdHkgaW5zaWRlIHRoZSBkcml2ZXJcbiAgICAgIGQuc2VydmVyID0gdGhpcy5zZXJ2ZXI7XG4gICAgICB0cnkge1xuICAgICAgICBydW5uaW5nRHJpdmVyc0RhdGEgPSBhd2FpdCB0aGlzLmN1clNlc3Npb25EYXRhRm9yRHJpdmVyKElubmVyRHJpdmVyKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5TZXNzaW9uTm90Q3JlYXRlZEVycm9yKGUubWVzc2FnZSk7XG4gICAgICB9XG4gICAgICBhd2FpdCBwZW5kaW5nRHJpdmVyc0d1YXJkLmFjcXVpcmUoQXBwaXVtRHJpdmVyLm5hbWUsICgpID0+IHtcbiAgICAgICAgdGhpcy5wZW5kaW5nRHJpdmVyc1tJbm5lckRyaXZlci5uYW1lXSA9IHRoaXMucGVuZGluZ0RyaXZlcnNbSW5uZXJEcml2ZXIubmFtZV0gfHwgW107XG4gICAgICAgIG90aGVyUGVuZGluZ0RyaXZlcnNEYXRhID0gdGhpcy5wZW5kaW5nRHJpdmVyc1tJbm5lckRyaXZlci5uYW1lXS5tYXAoKGRydikgPT4gZHJ2LmRyaXZlckRhdGEpO1xuICAgICAgICB0aGlzLnBlbmRpbmdEcml2ZXJzW0lubmVyRHJpdmVyLm5hbWVdLnB1c2goZCk7XG4gICAgICB9KTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgW2lubmVyU2Vzc2lvbklkLCBkQ2Fwc10gPSBhd2FpdCBkLmNyZWF0ZVNlc3Npb24oXG4gICAgICAgICAgcHJvY2Vzc2VkSnNvbndwQ2FwYWJpbGl0aWVzLFxuICAgICAgICAgIHJlcUNhcHMsXG4gICAgICAgICAgcHJvY2Vzc2VkVzNDQ2FwYWJpbGl0aWVzLFxuICAgICAgICAgIFsuLi5ydW5uaW5nRHJpdmVyc0RhdGEsIC4uLm90aGVyUGVuZGluZ0RyaXZlcnNEYXRhXVxuICAgICAgICApO1xuICAgICAgICBwcm90b2NvbCA9IGQucHJvdG9jb2w7XG4gICAgICAgIGF3YWl0IHNlc3Npb25zTGlzdEd1YXJkLmFjcXVpcmUoQXBwaXVtRHJpdmVyLm5hbWUsICgpID0+IHtcbiAgICAgICAgICB0aGlzLnNlc3Npb25zW2lubmVyU2Vzc2lvbklkXSA9IGQ7XG4gICAgICAgIH0pO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYXdhaXQgcGVuZGluZ0RyaXZlcnNHdWFyZC5hY3F1aXJlKEFwcGl1bURyaXZlci5uYW1lLCAoKSA9PiB7XG4gICAgICAgICAgXy5wdWxsKHRoaXMucGVuZGluZ0RyaXZlcnNbSW5uZXJEcml2ZXIubmFtZV0sIGQpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gdGhpcyBpcyBhbiBhc3luYyBmdW5jdGlvbiBidXQgd2UgZG9uJ3QgYXdhaXQgaXQgYmVjYXVzZSBpdCBoYW5kbGVzXG4gICAgICAvLyBhbiBvdXQtb2YtYmFuZCBwcm9taXNlIHdoaWNoIGlzIGZ1bGZpbGxlZCBpZiB0aGUgaW5uZXIgZHJpdmVyXG4gICAgICAvLyB1bmV4cGVjdGVkbHkgc2h1dHMgZG93blxuICAgICAgdGhpcy5hdHRhY2hVbmV4cGVjdGVkU2h1dGRvd25IYW5kbGVyKGQsIGlubmVyU2Vzc2lvbklkKTtcblxuICAgICAgbG9nLmluZm8oYE5ldyAke0lubmVyRHJpdmVyLm5hbWV9IHNlc3Npb24gY3JlYXRlZCBzdWNjZXNzZnVsbHksIHNlc3Npb24gYCArXG4gICAgICAgICAgICAgIGAke2lubmVyU2Vzc2lvbklkfSBhZGRlZCB0byBtYXN0ZXIgc2Vzc2lvbiBsaXN0YCk7XG5cbiAgICAgIC8vIHNldCB0aGUgTmV3IENvbW1hbmQgVGltZW91dCBmb3IgdGhlIGlubmVyIGRyaXZlclxuICAgICAgZC5zdGFydE5ld0NvbW1hbmRUaW1lb3V0KCk7XG5cbiAgICAgIC8vIGFwcGx5IGluaXRpYWwgdmFsdWVzIHRvIEFwcGl1bSBzZXR0aW5ncyAoaWYgcHJvdmlkZWQpXG4gICAgICBpZiAoZC5pc1czQ1Byb3RvY29sKCkgJiYgIV8uaXNFbXB0eSh3M2NTZXR0aW5ncykpIHtcbiAgICAgICAgbG9nLmluZm8oYEFwcGx5aW5nIHRoZSBpbml0aWFsIHZhbHVlcyB0byBBcHBpdW0gc2V0dGluZ3MgcGFyc2VkIGZyb20gVzNDIGNhcHM6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHczY1NldHRpbmdzKSk7XG4gICAgICAgIGF3YWl0IGQudXBkYXRlU2V0dGluZ3ModzNjU2V0dGluZ3MpO1xuICAgICAgfSBlbHNlIGlmIChkLmlzTWpzb253cFByb3RvY29sKCkgJiYgIV8uaXNFbXB0eShqd3BTZXR0aW5ncykpIHtcbiAgICAgICAgbG9nLmluZm8oYEFwcGx5aW5nIHRoZSBpbml0aWFsIHZhbHVlcyB0byBBcHBpdW0gc2V0dGluZ3MgcGFyc2VkIGZyb20gTUpTT05XUCBjYXBzOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShqd3BTZXR0aW5ncykpO1xuICAgICAgICBhd2FpdCBkLnVwZGF0ZVNldHRpbmdzKGp3cFNldHRpbmdzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcHJvdG9jb2wsXG4gICAgICAgIGVycm9yLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcHJvdG9jb2wsXG4gICAgICB2YWx1ZTogW2lubmVyU2Vzc2lvbklkLCBkQ2FwcywgcHJvdG9jb2xdXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIGF0dGFjaFVuZXhwZWN0ZWRTaHV0ZG93bkhhbmRsZXIgKGRyaXZlciwgaW5uZXJTZXNzaW9uSWQpIHtcbiAgICAvLyBSZW1vdmUgdGhlIHNlc3Npb24gb24gdW5leHBlY3RlZCBzaHV0ZG93biwgc28gdGhhdCB3ZSBhcmUgaW4gYSBwb3NpdGlvblxuICAgIC8vIHRvIG9wZW4gYW5vdGhlciBzZXNzaW9uIGxhdGVyIG9uLlxuICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIGJlIHJlbW92ZWQgYW5kIHJlcGxhY2VkIGJ5IGEgb25TaHV0ZG93biBjYWxsYmFjay5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgZHJpdmVyLm9uVW5leHBlY3RlZFNodXRkb3duOyAvLyB0aGlzIGlzIGEgY2FuY2VsbGFibGUgcHJvbWlzZVxuICAgICAgLy8gaWYgd2UgZ2V0IGhlcmUsIHdlJ3ZlIGhhZCBhbiB1bmV4cGVjdGVkIHNodXRkb3duLCBzbyBlcnJvclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHNodXRkb3duJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBCLkNhbmNlbGxhdGlvbkVycm9yKSB7XG4gICAgICAgIC8vIGlmIHdlIGNhbmNlbGxlZCB0aGUgdW5leHBlY3RlZCBzaHV0ZG93biBwcm9taXNlLCB0aGF0IG1lYW5zIHdlXG4gICAgICAgIC8vIG5vIGxvbmdlciBjYXJlIGFib3V0IGl0LCBhbmQgY2FuIHNhZmVseSBpZ25vcmUgaXRcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbG9nLndhcm4oYENsb3Npbmcgc2Vzc2lvbiwgY2F1c2Ugd2FzICcke2UubWVzc2FnZX0nYCk7XG4gICAgICBsb2cuaW5mbyhgUmVtb3Zpbmcgc2Vzc2lvbiAke2lubmVyU2Vzc2lvbklkfSBmcm9tIG91ciBtYXN0ZXIgc2Vzc2lvbiBsaXN0YCk7XG4gICAgICBhd2FpdCBzZXNzaW9uc0xpc3RHdWFyZC5hY3F1aXJlKEFwcGl1bURyaXZlci5uYW1lLCAoKSA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnNlc3Npb25zW2lubmVyU2Vzc2lvbklkXTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGN1clNlc3Npb25EYXRhRm9yRHJpdmVyIChJbm5lckRyaXZlcikge1xuICAgIGNvbnN0IHNlc3Npb25zID0gYXdhaXQgc2Vzc2lvbnNMaXN0R3VhcmQuYWNxdWlyZShBcHBpdW1Ecml2ZXIubmFtZSwgKCkgPT4gdGhpcy5zZXNzaW9ucyk7XG4gICAgY29uc3QgZGF0YSA9IF8udmFsdWVzKHNlc3Npb25zKVxuICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKHMpID0+IHMuY29uc3RydWN0b3IubmFtZSA9PT0gSW5uZXJEcml2ZXIubmFtZSlcbiAgICAgICAgICAgICAgICAgICAubWFwKChzKSA9PiBzLmRyaXZlckRhdGEpO1xuICAgIGZvciAobGV0IGRhdHVtIG9mIGRhdGEpIHtcbiAgICAgIGlmICghZGF0dW0pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQcm9ibGVtIGdldHRpbmcgc2Vzc2lvbiBkYXRhIGZvciBkcml2ZXIgdHlwZSBgICtcbiAgICAgICAgICAgICAgICAgICAgICAgIGAke0lubmVyRHJpdmVyLm5hbWV9OyBkb2VzIGl0IGltcGxlbWVudCAnZ2V0IGAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgYGRyaXZlckRhdGEnP2ApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVNlc3Npb24gKHNlc3Npb25JZCkge1xuICAgIGxldCBwcm90b2NvbDtcbiAgICB0cnkge1xuICAgICAgbGV0IG90aGVyU2Vzc2lvbnNEYXRhID0gbnVsbDtcbiAgICAgIGxldCBkc3RTZXNzaW9uID0gbnVsbDtcbiAgICAgIGF3YWl0IHNlc3Npb25zTGlzdEd1YXJkLmFjcXVpcmUoQXBwaXVtRHJpdmVyLm5hbWUsICgpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnNlc3Npb25zW3Nlc3Npb25JZF0pIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY3VyQ29uc3RydWN0b3JOYW1lID0gdGhpcy5zZXNzaW9uc1tzZXNzaW9uSWRdLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgIG90aGVyU2Vzc2lvbnNEYXRhID0gXy50b1BhaXJzKHRoaXMuc2Vzc2lvbnMpXG4gICAgICAgICAgICAgIC5maWx0ZXIoKFtrZXksIHZhbHVlXSkgPT4gdmFsdWUuY29uc3RydWN0b3IubmFtZSA9PT0gY3VyQ29uc3RydWN0b3JOYW1lICYmIGtleSAhPT0gc2Vzc2lvbklkKVxuICAgICAgICAgICAgICAubWFwKChbLCB2YWx1ZV0pID0+IHZhbHVlLmRyaXZlckRhdGEpO1xuICAgICAgICBkc3RTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1tzZXNzaW9uSWRdO1xuICAgICAgICBwcm90b2NvbCA9IGRzdFNlc3Npb24ucHJvdG9jb2w7XG4gICAgICAgIGxvZy5pbmZvKGBSZW1vdmluZyBzZXNzaW9uICR7c2Vzc2lvbklkfSBmcm9tIG91ciBtYXN0ZXIgc2Vzc2lvbiBsaXN0YCk7XG4gICAgICAgIC8vIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgZGVsZXRlU2Vzc2lvbiBjb21wbGV0ZXMgc3VjY2Vzc2Z1bGx5IG9yIG5vdFxuICAgICAgICAvLyBtYWtlIHRoZSBzZXNzaW9uIHVuYXZhaWxhYmxlLCBiZWNhdXNlIHdobyBrbm93cyB3aGF0IHN0YXRlIGl0IG1pZ2h0XG4gICAgICAgIC8vIGJlIGluIG90aGVyd2lzZVxuICAgICAgICBkZWxldGUgdGhpcy5zZXNzaW9uc1tzZXNzaW9uSWRdO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBwcm90b2NvbCxcbiAgICAgICAgdmFsdWU6IGF3YWl0IGRzdFNlc3Npb24uZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQsIG90aGVyU2Vzc2lvbnNEYXRhKSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nLmVycm9yKGBIYWQgdHJvdWJsZSBlbmRpbmcgc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcHJvdG9jb2wsXG4gICAgICAgIGVycm9yOiBlLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBleGVjdXRlQ29tbWFuZCAoY21kLCAuLi5hcmdzKSB7XG4gICAgLy8gZ2V0U3RhdHVzIGNvbW1hbmQgc2hvdWxkIG5vdCBiZSBwdXQgaW50byBxdWV1ZS4gSWYgd2UgZG8gaXQgYXMgcGFydCBvZiBzdXBlci5leGVjdXRlQ29tbWFuZCwgaXQgd2lsbCBiZSBhZGRlZCB0byBxdWV1ZS5cbiAgICAvLyBUaGVyZSB3aWxsIGJlIGxvdCBvZiBzdGF0dXMgY29tbWFuZHMgaW4gcXVldWUgZHVyaW5nIGNyZWF0ZVNlc3Npb24gY29tbWFuZCwgYXMgY3JlYXRlU2Vzc2lvbiBjYW4gdGFrZSB1cCB0byBvciBtb3JlIHRoYW4gYSBtaW51dGUuXG4gICAgaWYgKGNtZCA9PT0gJ2dldFN0YXR1cycpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFN0YXR1cygpO1xuICAgIH1cblxuICAgIGlmIChpc0FwcGl1bURyaXZlckNvbW1hbmQoY21kKSkge1xuICAgICAgcmV0dXJuIGF3YWl0IHN1cGVyLmV4ZWN1dGVDb21tYW5kKGNtZCwgLi4uYXJncyk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2Vzc2lvbklkID0gXy5sYXN0KGFyZ3MpO1xuICAgIGNvbnN0IGRzdFNlc3Npb24gPSBhd2FpdCBzZXNzaW9uc0xpc3RHdWFyZC5hY3F1aXJlKEFwcGl1bURyaXZlci5uYW1lLCAoKSA9PiB0aGlzLnNlc3Npb25zW3Nlc3Npb25JZF0pO1xuICAgIGlmICghZHN0U2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGUgc2Vzc2lvbiB3aXRoIGlkICcke3Nlc3Npb25JZH0nIGRvZXMgbm90IGV4aXN0YCk7XG4gICAgfVxuXG4gICAgbGV0IHJlcyA9IHtcbiAgICAgIHByb3RvY29sOiBkc3RTZXNzaW9uLnByb3RvY29sXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICByZXMudmFsdWUgPSBhd2FpdCBkc3RTZXNzaW9uLmV4ZWN1dGVDb21tYW5kKGNtZCwgLi4uYXJncyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmVzLmVycm9yID0gZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbiAgfVxuXG4gIHByb3h5QWN0aXZlIChzZXNzaW9uSWQpIHtcbiAgICBjb25zdCBkc3RTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1tzZXNzaW9uSWRdO1xuICAgIHJldHVybiBkc3RTZXNzaW9uICYmIF8uaXNGdW5jdGlvbihkc3RTZXNzaW9uLnByb3h5QWN0aXZlKSAmJiBkc3RTZXNzaW9uLnByb3h5QWN0aXZlKHNlc3Npb25JZCk7XG4gIH1cblxuICBnZXRQcm94eUF2b2lkTGlzdCAoc2Vzc2lvbklkKSB7XG4gICAgY29uc3QgZHN0U2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNbc2Vzc2lvbklkXTtcbiAgICByZXR1cm4gZHN0U2Vzc2lvbiA/IGRzdFNlc3Npb24uZ2V0UHJveHlBdm9pZExpc3QoKSA6IFtdO1xuICB9XG5cbiAgY2FuUHJveHkgKHNlc3Npb25JZCkge1xuICAgIGNvbnN0IGRzdFNlc3Npb24gPSB0aGlzLnNlc3Npb25zW3Nlc3Npb25JZF07XG4gICAgcmV0dXJuIGRzdFNlc3Npb24gJiYgZHN0U2Vzc2lvbi5jYW5Qcm94eShzZXNzaW9uSWQpO1xuICB9XG59XG5cbi8vIGhlbHAgZGVjaWRlIHdoaWNoIGNvbW1hbmRzIHNob3VsZCBiZSBwcm94aWVkIHRvIHN1Yi1kcml2ZXJzIGFuZCB3aGljaFxuLy8gc2hvdWxkIGJlIGhhbmRsZWQgYnkgdGhpcywgb3VyIHVtYnJlbGxhIGRyaXZlclxuZnVuY3Rpb24gaXNBcHBpdW1Ecml2ZXJDb21tYW5kIChjbWQpIHtcbiAgcmV0dXJuICFpc1Nlc3Npb25Db21tYW5kKGNtZCkgfHwgY21kID09PSAnZGVsZXRlU2Vzc2lvbic7XG59XG5cbmV4cG9ydCB7IEFwcGl1bURyaXZlciB9O1xuIl0sImZpbGUiOiJsaWIvYXBwaXVtLmpzIiwic291cmNlUm9vdCI6Ii4uLy4uIn0=
