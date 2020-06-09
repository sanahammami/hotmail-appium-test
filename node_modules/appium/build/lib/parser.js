"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDefaultArgs = getDefaultArgs;
exports.getParser = getParser;
exports.default = void 0;

require("source-map-support/register");

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _lodash = _interopRequireDefault(require("lodash"));

var _argparse = require("argparse");

var _utils = require("./utils");

var _appiumBaseDriver = require("appium-base-driver");

const args = [[['--shell'], {
  required: false,
  defaultValue: null,
  help: 'Enter REPL mode',
  nargs: 0,
  dest: 'shell'
}], [['--allow-cors'], {
  required: false,
  defaultValue: false,
  action: 'storeTrue',
  help: 'Whether the Appium server should allow web browser connections from any host',
  nargs: 0,
  dest: 'allowCors'
}], [['--reboot'], {
  defaultValue: false,
  dest: 'reboot',
  action: 'storeTrue',
  required: false,
  help: '(Android-only) reboot emulator after each session and kill it at the end',
  nargs: 0
}], [['--ipa'], {
  required: false,
  defaultValue: null,
  help: '(IOS-only) abs path to compiled .ipa file',
  example: '/abs/path/to/my.ipa',
  dest: 'ipa'
}], [['-a', '--address'], {
  defaultValue: '0.0.0.0',
  required: false,
  example: '0.0.0.0',
  help: 'IP Address to listen on',
  dest: 'address'
}], [['-p', '--port'], {
  defaultValue: 4723,
  required: false,
  type: 'int',
  example: '4723',
  help: 'port to listen on',
  dest: 'port'
}], [['-pa', '--base-path'], {
  required: false,
  defaultValue: _appiumBaseDriver.DEFAULT_BASE_PATH,
  dest: 'basePath',
  example: '/path/prefix',
  help: 'Base path to use as the prefix for all webdriver routes running' + `on this server (default: ${_appiumBaseDriver.DEFAULT_BASE_PATH})`
}], [['-ca', '--callback-address'], {
  required: false,
  dest: 'callbackAddress',
  defaultValue: null,
  example: '127.0.0.1',
  help: 'callback IP Address (default: same as --address)'
}], [['-cp', '--callback-port'], {
  required: false,
  dest: 'callbackPort',
  defaultValue: null,
  type: 'int',
  example: '4723',
  help: 'callback port (default: same as port)'
}], [['-bp', '--bootstrap-port'], {
  defaultValue: 4724,
  dest: 'bootstrapPort',
  required: false,
  type: 'int',
  example: '4724',
  help: '(Android-only) port to use on device to talk to Appium'
}], [['-r', '--backend-retries'], {
  defaultValue: 3,
  dest: 'backendRetries',
  required: false,
  type: 'int',
  example: '3',
  help: '(iOS-only) How many times to retry launching Instruments ' + 'before saying it crashed or timed out'
}], [['--session-override'], {
  defaultValue: false,
  dest: 'sessionOverride',
  action: 'storeTrue',
  required: false,
  help: 'Enables session override (clobbering)',
  nargs: 0
}], [['-l', '--pre-launch'], {
  defaultValue: false,
  dest: 'launch',
  action: 'storeTrue',
  required: false,
  help: 'Pre-launch the application before allowing the first session ' + '(Requires --app and, for Android, --app-pkg and --app-activity)',
  nargs: 0
}], [['-g', '--log'], {
  defaultValue: null,
  dest: 'logFile',
  required: false,
  example: '/path/to/appium.log',
  help: 'Also send log output to this file'
}], [['--log-level'], {
  choices: ['info', 'info:debug', 'info:info', 'info:warn', 'info:error', 'warn', 'warn:debug', 'warn:info', 'warn:warn', 'warn:error', 'error', 'error:debug', 'error:info', 'error:warn', 'error:error', 'debug', 'debug:debug', 'debug:info', 'debug:warn', 'debug:error'],
  defaultValue: 'debug',
  dest: 'loglevel',
  required: false,
  example: 'debug',
  help: 'log level; default (console[:file]): debug[:debug]'
}], [['--log-timestamp'], {
  defaultValue: false,
  required: false,
  help: 'Show timestamps in console output',
  nargs: 0,
  action: 'storeTrue',
  dest: 'logTimestamp'
}], [['--local-timezone'], {
  defaultValue: false,
  required: false,
  help: 'Use local timezone for timestamps',
  nargs: 0,
  action: 'storeTrue',
  dest: 'localTimezone'
}], [['--log-no-colors'], {
  defaultValue: false,
  required: false,
  help: 'Do not use colors in console output',
  nargs: 0,
  action: 'storeTrue',
  dest: 'logNoColors'
}], [['-G', '--webhook'], {
  defaultValue: null,
  required: false,
  example: 'localhost:9876',
  dest: 'webhook',
  help: 'Also send log output to this HTTP listener'
}], [['--safari'], {
  defaultValue: false,
  action: 'storeTrue',
  dest: 'safari',
  required: false,
  help: '(IOS-Only) Use the safari app',
  nargs: 0
}], [['--default-device', '-dd'], {
  dest: 'defaultDevice',
  defaultValue: false,
  action: 'storeTrue',
  required: false,
  help: '(IOS-Simulator-only) use the default simulator that instruments ' + 'launches on its own'
}], [['--force-iphone'], {
  defaultValue: false,
  dest: 'forceIphone',
  action: 'storeTrue',
  required: false,
  help: '(IOS-only) Use the iPhone Simulator no matter what the app wants',
  nargs: 0
}], [['--force-ipad'], {
  defaultValue: false,
  dest: 'forceIpad',
  action: 'storeTrue',
  required: false,
  help: '(IOS-only) Use the iPad Simulator no matter what the app wants',
  nargs: 0
}], [['--tracetemplate'], {
  defaultValue: null,
  dest: 'automationTraceTemplatePath',
  required: false,
  example: '/Users/me/Automation.tracetemplate',
  help: '(IOS-only) .tracetemplate file to use with Instruments'
}], [['--instruments'], {
  defaultValue: null,
  dest: 'instrumentsPath',
  require: false,
  example: '/path/to/instruments',
  help: '(IOS-only) path to instruments binary'
}], [['--nodeconfig'], {
  required: false,
  defaultValue: null,
  dest: 'nodeconfig',
  help: 'Configuration JSON file to register appium with selenium grid',
  example: '/abs/path/to/nodeconfig.json'
}], [['-ra', '--robot-address'], {
  defaultValue: '0.0.0.0',
  dest: 'robotAddress',
  required: false,
  example: '0.0.0.0',
  help: 'IP Address of robot'
}], [['-rp', '--robot-port'], {
  defaultValue: -1,
  dest: 'robotPort',
  required: false,
  type: 'int',
  example: '4242',
  help: 'port for robot'
}], [['--chromedriver-port'], {
  defaultValue: null,
  dest: 'chromeDriverPort',
  required: false,
  type: 'int',
  example: '9515',
  help: 'Port upon which ChromeDriver will run. If not given, Android driver will pick a random available port.'
}], [['--chromedriver-executable'], {
  defaultValue: null,
  dest: 'chromedriverExecutable',
  required: false,
  help: 'ChromeDriver executable full path'
}], [['--show-config'], {
  defaultValue: false,
  dest: 'showConfig',
  action: 'storeTrue',
  required: false,
  help: 'Show info about the appium server configuration and exit'
}], [['--no-perms-check'], {
  defaultValue: false,
  dest: 'noPermsCheck',
  action: 'storeTrue',
  required: false,
  help: 'Bypass Appium\'s checks to ensure we can read/write necessary files'
}], [['--strict-caps'], {
  defaultValue: false,
  dest: 'enforceStrictCaps',
  action: 'storeTrue',
  required: false,
  help: 'Cause sessions to fail if desired caps are sent in that Appium ' + 'does not recognize as valid for the selected device',
  nargs: 0
}], [['--isolate-sim-device'], {
  defaultValue: false,
  dest: 'isolateSimDevice',
  action: 'storeTrue',
  required: false,
  help: 'Xcode 6 has a bug on some platforms where a certain simulator ' + 'can only be launched without error if all other simulator devices ' + 'are first deleted. This option causes Appium to delete all ' + 'devices other than the one being used by Appium. Note that this ' + 'is a permanent deletion, and you are responsible for using simctl ' + 'or xcode to manage the categories of devices used with Appium.',
  nargs: 0
}], [['--tmp'], {
  defaultValue: null,
  dest: 'tmpDir',
  required: false,
  help: 'Absolute path to directory Appium can use to manage temporary ' + 'files, like built-in iOS apps it needs to move around. On *nix/Mac ' + 'defaults to /tmp, on Windows defaults to C:\\Windows\\Temp'
}], [['--trace-dir'], {
  defaultValue: null,
  dest: 'traceDir',
  required: false,
  help: 'Absolute path to directory Appium use to save ios instruments ' + 'traces, defaults to <tmp dir>/appium-instruments'
}], [['--debug-log-spacing'], {
  dest: 'debugLogSpacing',
  defaultValue: false,
  action: 'storeTrue',
  required: false,
  help: 'Add exaggerated spacing in logs to help with visual inspection'
}], [['--suppress-adb-kill-server'], {
  dest: 'suppressKillServer',
  defaultValue: false,
  action: 'storeTrue',
  required: false,
  help: '(Android-only) If set, prevents Appium from killing the adb server instance',
  nargs: 0
}], [['--long-stacktrace'], {
  dest: 'longStacktrace',
  defaultValue: false,
  required: false,
  action: 'storeTrue',
  help: 'Add long stack traces to log entries. Recommended for debugging only.'
}], [['--webkit-debug-proxy-port'], {
  defaultValue: 27753,
  dest: 'webkitDebugProxyPort',
  required: false,
  type: 'int',
  example: '27753',
  help: '(IOS-only) Local port used for communication with ios-webkit-debug-proxy'
}], [['--webdriveragent-port'], {
  defaultValue: 8100,
  dest: 'wdaLocalPort',
  required: false,
  type: 'int',
  example: '8100',
  help: '(IOS-only, XCUITest-only) Local port used for communication with WebDriverAgent'
}], [['-dc', '--default-capabilities'], {
  dest: 'defaultCapabilities',
  defaultValue: {},
  type: parseDefaultCaps,
  required: false,
  example: '[ \'{"app": "myapp.app", "deviceName": "iPhone Simulator"}\' ' + '| /path/to/caps.json ]',
  help: 'Set the default desired capabilities, which will be set on each ' + 'session unless overridden by received capabilities.'
}], [['--relaxed-security'], {
  defaultValue: false,
  dest: 'relaxedSecurityEnabled',
  action: 'storeTrue',
  required: false,
  help: 'Disable additional security checks, so it is possible to use some advanced features, provided ' + 'by drivers supporting this option. Only enable it if all the ' + 'clients are in the trusted network and it\'s not the case if a client could potentially ' + 'break out of the session sandbox. Specific features can be overridden by ' + 'using the --deny-insecure flag',
  nargs: 0
}], [['--allow-insecure'], {
  dest: 'allowInsecure',
  defaultValue: [],
  type: parseSecurityFeatures,
  required: false,
  example: 'execute_driver_script,adb_shell',
  help: 'Set which insecure features are allowed to run in this server\'s sessions. ' + 'Features are defined on a driver level; see documentation for more details. ' + 'This should be either a comma-separated list of feature names, or a path to ' + 'a file where each feature name is on a line. Note that features defined via ' + '--deny-insecure will be disabled, even if also listed here.'
}], [['--deny-insecure'], {
  dest: 'denyInsecure',
  defaultValue: [],
  type: parseSecurityFeatures,
  required: false,
  example: 'execute_driver_script,adb_shell',
  help: 'Set which insecure features are not allowed to run in this server\'s sessions. ' + 'Features are defined on a driver level; see documentation for more details. ' + 'This should be either a comma-separated list of feature names, or a path to ' + 'a file where each feature name is on a line. Features listed here will not be ' + 'enabled even if also listed in --allow-insecure, and even if --relaxed-security ' + 'is turned on.'
}]];
const deprecatedArgs = [[['--command-timeout'], {
  defaultValue: 60,
  dest: 'defaultCommandTimeout',
  type: 'int',
  required: false,
  help: '[DEPRECATED] No effect. This used to be the default command ' + 'timeout for the server to use for all sessions (in seconds and ' + 'should be less than 2147483). Use newCommandTimeout cap instead'
}], [['-k', '--keep-artifacts'], {
  defaultValue: false,
  dest: 'keepArtifacts',
  action: 'storeTrue',
  required: false,
  help: '[DEPRECATED] - no effect, trace is now in tmp dir by default and is ' + 'cleared before each run. Please also refer to the --trace-dir flag.',
  nargs: 0
}], [['--platform-name'], {
  dest: 'platformName',
  defaultValue: null,
  required: false,
  deprecatedFor: '--default-capabilities',
  example: 'iOS',
  help: '[DEPRECATED] - Name of the mobile platform: iOS, Android, or FirefoxOS'
}], [['--platform-version'], {
  dest: 'platformVersion',
  defaultValue: null,
  required: false,
  deprecatedFor: '--default-capabilities',
  example: '7.1',
  help: '[DEPRECATED] - Version of the mobile platform'
}], [['--automation-name'], {
  dest: 'automationName',
  defaultValue: null,
  required: false,
  deprecatedFor: '--default-capabilities',
  example: 'Appium',
  help: '[DEPRECATED] - Name of the automation tool: Appium, XCUITest, etc.'
}], [['--device-name'], {
  dest: 'deviceName',
  defaultValue: null,
  required: false,
  deprecatedFor: '--default-capabilities',
  example: 'iPhone Retina (4-inch), Android Emulator',
  help: '[DEPRECATED] - Name of the mobile device to use'
}], [['--browser-name'], {
  dest: 'browserName',
  defaultValue: null,
  required: false,
  deprecatedFor: '--default-capabilities',
  example: 'Safari',
  help: '[DEPRECATED] - Name of the mobile browser: Safari or Chrome'
}], [['--app'], {
  dest: 'app',
  required: false,
  defaultValue: null,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - IOS: abs path to simulator-compiled .app file or the bundle_id of the desired target on device; Android: abs path to .apk file',
  example: '/abs/path/to/my.app'
}], [['-lt', '--launch-timeout'], {
  defaultValue: 90000,
  dest: 'launchTimeout',
  type: 'int',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (iOS-only) how long in ms to wait for Instruments to launch'
}], [['--language'], {
  defaultValue: null,
  dest: 'language',
  required: false,
  example: 'en',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - Language for the iOS simulator / Android Emulator'
}], [['--locale'], {
  defaultValue: null,
  dest: 'locale',
  required: false,
  example: 'en_US',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - Locale for the iOS simulator / Android Emulator'
}], [['-U', '--udid'], {
  dest: 'udid',
  required: false,
  defaultValue: null,
  example: '1adsf-sdfas-asdf-123sdf',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - Unique device identifier of the connected physical device'
}], [['--orientation'], {
  dest: 'orientation',
  defaultValue: null,
  required: false,
  example: 'LANDSCAPE',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (IOS-only) use LANDSCAPE or PORTRAIT to initialize all requests ' + 'to this orientation'
}], [['--no-reset'], {
  defaultValue: false,
  dest: 'noReset',
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - Do not reset app state between sessions (IOS: do not delete app ' + 'plist files; Android: do not uninstall app before new session)',
  nargs: 0
}], [['--full-reset'], {
  defaultValue: false,
  dest: 'fullReset',
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (iOS) Delete the entire simulator folder. (Android) Reset app ' + 'state by uninstalling app instead of clearing app data. On ' + 'Android, this will also remove the app after the session is complete.',
  nargs: 0
}], [['--app-pkg'], {
  dest: 'appPackage',
  defaultValue: null,
  required: false,
  deprecatedFor: '--default-capabilities',
  example: 'com.example.android.myApp',
  help: '[DEPRECATED] - (Android-only) Java package of the Android app you want to run ' + '(e.g., com.example.android.myApp)'
}], [['--app-activity'], {
  dest: 'appActivity',
  defaultValue: null,
  required: false,
  example: 'MainActivity',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Activity name for the Android activity you want ' + 'to launch from your package (e.g., MainActivity)'
}], [['--app-wait-package'], {
  dest: 'appWaitPackage',
  defaultValue: false,
  required: false,
  example: 'com.example.android.myApp',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Package name for the Android activity you want ' + 'to wait for (e.g., com.example.android.myApp)'
}], [['--app-wait-activity'], {
  dest: 'appWaitActivity',
  defaultValue: false,
  required: false,
  example: 'SplashActivity',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Activity name for the Android activity you want ' + 'to wait for (e.g., SplashActivity)'
}], [['--device-ready-timeout'], {
  dest: 'deviceReadyTimeout',
  defaultValue: 5,
  required: false,
  type: 'int',
  example: '5',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Timeout in seconds while waiting for device to become ready'
}], [['--android-coverage'], {
  dest: 'androidCoverage',
  defaultValue: false,
  required: false,
  example: 'com.my.Pkg/com.my.Pkg.instrumentation.MyInstrumentation',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Fully qualified instrumentation class. Passed to -w in ' + 'adb shell am instrument -e coverage true -w '
}], [['--avd'], {
  dest: 'avd',
  defaultValue: null,
  required: false,
  example: '@default',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Name of the avd to launch'
}], [['--avd-args'], {
  dest: 'avdArgs',
  defaultValue: null,
  required: false,
  example: '-no-snapshot-load',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Additional emulator arguments to launch the avd'
}], [['--use-keystore'], {
  defaultValue: false,
  dest: 'useKeystore',
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) When set the keystore will be used to sign apks.'
}], [['--keystore-path'], {
  defaultValue: _path.default.resolve(process.env.HOME || process.env.USERPROFILE || '', '.android', 'debug.keystore'),
  dest: 'keystorePath',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Path to keystore'
}], [['--keystore-password'], {
  defaultValue: 'android',
  dest: 'keystorePassword',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Password to keystore'
}], [['--key-alias'], {
  defaultValue: 'androiddebugkey',
  dest: 'keyAlias',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Key alias'
}], [['--key-password'], {
  defaultValue: 'android',
  dest: 'keyPassword',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Key password'
}], [['--intent-action'], {
  dest: 'intentAction',
  defaultValue: 'android.intent.action.MAIN',
  required: false,
  example: 'android.intent.action.MAIN',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Intent action which will be used to start activity'
}], [['--intent-category'], {
  dest: 'intentCategory',
  defaultValue: 'android.intent.category.LAUNCHER',
  required: false,
  example: 'android.intent.category.APP_CONTACTS',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Intent category which will be used to start activity'
}], [['--intent-flags'], {
  dest: 'intentFlags',
  defaultValue: '0x10200000',
  required: false,
  example: '0x10200000',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Flags that will be used to start activity'
}], [['--intent-args'], {
  dest: 'optionalIntentArguments',
  defaultValue: null,
  required: false,
  example: '0x10200000',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) Additional intent arguments that will be used to ' + 'start activity'
}], [['--dont-stop-app-on-reset'], {
  dest: 'dontStopAppOnReset',
  defaultValue: false,
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (Android-only) When included, refrains from stopping the app before restart'
}], [['--calendar-format'], {
  defaultValue: null,
  dest: 'calendarFormat',
  required: false,
  example: 'gregorian',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (IOS-only) calendar format for the iOS simulator'
}], [['--native-instruments-lib'], {
  defaultValue: false,
  dest: 'nativeInstrumentsLib',
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (IOS-only) IOS has a weird built-in unavoidable ' + 'delay. We patch this in appium. If you do not want it patched, ' + 'pass in this flag.',
  nargs: 0
}], [['--keep-keychains'], {
  defaultValue: false,
  dest: 'keepKeyChains',
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (iOS-only) Whether to keep keychains (Library/Keychains) when reset app between sessions',
  nargs: 0
}], [['--localizable-strings-dir'], {
  required: false,
  dest: 'localizableStringsDir',
  defaultValue: 'en.lproj',
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (IOS-only) the relative path of the dir where Localizable.strings file resides ',
  example: 'en.lproj'
}], [['--show-ios-log'], {
  defaultValue: false,
  dest: 'showIOSLog',
  action: 'storeTrue',
  required: false,
  deprecatedFor: '--default-capabilities',
  help: '[DEPRECATED] - (IOS-only) if set, the iOS system log will be written to the console',
  nargs: 0
}], [['--async-trace'], {
  dest: 'longStacktrace',
  defaultValue: false,
  required: false,
  action: 'storeTrue',
  deprecatedFor: '--long-stacktrace',
  help: '[DEPRECATED] - Add long stack traces to log entries. Recommended for debugging only.'
}]];

function updateParseArgsForDefaultCapabilities(parser) {
  parser._parseArgs = parser.parseArgs;

  parser.parseArgs = function parseArgs(args) {
    let parsedArgs = parser._parseArgs(args);

    parsedArgs.defaultCapabilities = parsedArgs.defaultCapabilities || {};

    for (let argEntry of deprecatedArgs) {
      let arg = argEntry[1].dest;

      if (argEntry[1].deprecatedFor === '--default-capabilities') {
        if (arg in parsedArgs && parsedArgs[arg] !== argEntry[1].defaultValue) {
          parsedArgs.defaultCapabilities[arg] = parsedArgs[arg];
          let capDict = {
            [arg]: parsedArgs[arg]
          };
          argEntry[1].deprecatedFor = `--default-capabilities ` + `'${JSON.stringify(capDict)}'`;
        }
      }
    }

    return parsedArgs;
  };
}

function parseSecurityFeatures(features) {
  const splitter = (splitOn, str) => `${str}`.split(splitOn).map(s => s.trim()).filter(Boolean);

  let parsedFeatures;

  try {
    parsedFeatures = splitter(',', features);
  } catch (err) {
    throw new Error('Could not parse value of --allow/deny-insecure. Should be ' + 'a list of strings separated by commas, or a path to a file ' + 'listing one feature name per line.');
  }

  if (parsedFeatures.length === 1 && _fs.default.existsSync(parsedFeatures[0])) {
    try {
      const fileFeatures = _fs.default.readFileSync(parsedFeatures[0], 'utf8');

      parsedFeatures = splitter('\n', fileFeatures);
    } catch (err) {
      throw new Error(`Attempted to read --allow/deny-insecure feature names ` + `from file ${parsedFeatures[0]} but got error: ${err.message}`);
    }
  }

  return parsedFeatures;
}

function parseDefaultCaps(caps) {
  try {
    if (_fs.default.statSync(caps).isFile()) {
      caps = _fs.default.readFileSync(caps, 'utf8');
    }
  } catch (err) {}

  caps = JSON.parse(caps);

  if (!_lodash.default.isPlainObject(caps)) {
    throw 'Invalid format for default capabilities';
  }

  return caps;
}

function getParser() {
  let parser = new _argparse.ArgumentParser({
    version: require(_path.default.resolve(_utils.rootDir, 'package.json')).version,
    addHelp: true,
    description: 'A webdriver-compatible server for use with native and hybrid iOS and Android applications.',
    prog: process.argv[1] || 'Appium'
  });

  let allArgs = _lodash.default.union(args, deprecatedArgs);

  parser.rawArgs = allArgs;

  for (let arg of allArgs) {
    parser.addArgument(arg[0], arg[1]);
  }

  updateParseArgsForDefaultCapabilities(parser);
  return parser;
}

function getDefaultArgs() {
  let defaults = {};

  for (let [, arg] of args) {
    defaults[arg.dest] = arg.defaultValue;
  }

  return defaults;
}

var _default = getParser;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9wYXJzZXIuanMiXSwibmFtZXMiOlsiYXJncyIsInJlcXVpcmVkIiwiZGVmYXVsdFZhbHVlIiwiaGVscCIsIm5hcmdzIiwiZGVzdCIsImFjdGlvbiIsImV4YW1wbGUiLCJ0eXBlIiwiREVGQVVMVF9CQVNFX1BBVEgiLCJjaG9pY2VzIiwicmVxdWlyZSIsInBhcnNlRGVmYXVsdENhcHMiLCJwYXJzZVNlY3VyaXR5RmVhdHVyZXMiLCJkZXByZWNhdGVkQXJncyIsImRlcHJlY2F0ZWRGb3IiLCJwYXRoIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJlbnYiLCJIT01FIiwiVVNFUlBST0ZJTEUiLCJ1cGRhdGVQYXJzZUFyZ3NGb3JEZWZhdWx0Q2FwYWJpbGl0aWVzIiwicGFyc2VyIiwiX3BhcnNlQXJncyIsInBhcnNlQXJncyIsInBhcnNlZEFyZ3MiLCJkZWZhdWx0Q2FwYWJpbGl0aWVzIiwiYXJnRW50cnkiLCJhcmciLCJjYXBEaWN0IiwiSlNPTiIsInN0cmluZ2lmeSIsImZlYXR1cmVzIiwic3BsaXR0ZXIiLCJzcGxpdE9uIiwic3RyIiwic3BsaXQiLCJtYXAiLCJzIiwidHJpbSIsImZpbHRlciIsIkJvb2xlYW4iLCJwYXJzZWRGZWF0dXJlcyIsImVyciIsIkVycm9yIiwibGVuZ3RoIiwiZnMiLCJleGlzdHNTeW5jIiwiZmlsZUZlYXR1cmVzIiwicmVhZEZpbGVTeW5jIiwibWVzc2FnZSIsImNhcHMiLCJzdGF0U3luYyIsImlzRmlsZSIsInBhcnNlIiwiXyIsImlzUGxhaW5PYmplY3QiLCJnZXRQYXJzZXIiLCJBcmd1bWVudFBhcnNlciIsInZlcnNpb24iLCJyb290RGlyIiwiYWRkSGVscCIsImRlc2NyaXB0aW9uIiwicHJvZyIsImFyZ3YiLCJhbGxBcmdzIiwidW5pb24iLCJyYXdBcmdzIiwiYWRkQXJndW1lbnQiLCJnZXREZWZhdWx0QXJncyIsImRlZmF1bHRzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FB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K0MsSUFBUixDQUFhLENBQWIsS0FBbUI7QUFKSyxHQUFuQixDQUFiOztBQU1BLE1BQUlDLE9BQU8sR0FBR1YsZ0JBQUVXLEtBQUYsQ0FBUW5FLElBQVIsRUFBY2MsY0FBZCxDQUFkOztBQUNBUyxFQUFBQSxNQUFNLENBQUM2QyxPQUFQLEdBQWlCRixPQUFqQjs7QUFDQSxPQUFLLElBQUlyQyxHQUFULElBQWdCcUMsT0FBaEIsRUFBeUI7QUFDdkIzQyxJQUFBQSxNQUFNLENBQUM4QyxXQUFQLENBQW1CeEMsR0FBRyxDQUFDLENBQUQsQ0FBdEIsRUFBMkJBLEdBQUcsQ0FBQyxDQUFELENBQTlCO0FBQ0Q7O0FBQ0RQLEVBQUFBLHFDQUFxQyxDQUFDQyxNQUFELENBQXJDO0FBRUEsU0FBT0EsTUFBUDtBQUNEOztBQUVELFNBQVMrQyxjQUFULEdBQTJCO0FBQ3pCLE1BQUlDLFFBQVEsR0FBRyxFQUFmOztBQUNBLE9BQUssSUFBSSxHQUFHMUMsR0FBSCxDQUFULElBQW9CN0IsSUFBcEIsRUFBMEI7QUFDeEJ1RSxJQUFBQSxRQUFRLENBQUMxQyxHQUFHLENBQUN4QixJQUFMLENBQVIsR0FBcUJ3QixHQUFHLENBQUMzQixZQUF6QjtBQUNEOztBQUNELFNBQU9xRSxRQUFQO0FBQ0Q7O2VBRWNiLFMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgQXJndW1lbnRQYXJzZXIgfSBmcm9tICdhcmdwYXJzZSc7XG5pbXBvcnQgeyByb290RGlyIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBERUZBVUxUX0JBU0VfUEFUSCB9IGZyb20gJ2FwcGl1bS1iYXNlLWRyaXZlcic7XG5cbmNvbnN0IGFyZ3MgPSBbXG4gIFtbJy0tc2hlbGwnXSwge1xuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgaGVscDogJ0VudGVyIFJFUEwgbW9kZScsXG4gICAgbmFyZ3M6IDAsXG4gICAgZGVzdDogJ3NoZWxsJyxcbiAgfV0sXG5cbiAgW1snLS1hbGxvdy1jb3JzJ10sIHtcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIGhlbHA6ICdXaGV0aGVyIHRoZSBBcHBpdW0gc2VydmVyIHNob3VsZCBhbGxvdyB3ZWIgYnJvd3NlciBjb25uZWN0aW9ucyBmcm9tIGFueSBob3N0JyxcbiAgICBuYXJnczogMCxcbiAgICBkZXN0OiAnYWxsb3dDb3JzJyxcbiAgfV0sXG5cbiAgW1snLS1yZWJvb3QnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogZmFsc2UsXG4gICAgZGVzdDogJ3JlYm9vdCcsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJyhBbmRyb2lkLW9ubHkpIHJlYm9vdCBlbXVsYXRvciBhZnRlciBlYWNoIHNlc3Npb24gYW5kIGtpbGwgaXQgYXQgdGhlIGVuZCcsXG4gICAgbmFyZ3M6IDAsXG4gIH1dLFxuXG4gIFtbJy0taXBhJ10sIHtcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIGhlbHA6ICcoSU9TLW9ubHkpIGFicyBwYXRoIHRvIGNvbXBpbGVkIC5pcGEgZmlsZScsXG4gICAgZXhhbXBsZTogJy9hYnMvcGF0aC90by9teS5pcGEnLFxuICAgIGRlc3Q6ICdpcGEnLFxuICB9XSxcblxuICBbWyctYScsICctLWFkZHJlc3MnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogJzAuMC4wLjAnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnMC4wLjAuMCcsXG4gICAgaGVscDogJ0lQIEFkZHJlc3MgdG8gbGlzdGVuIG9uJyxcbiAgICBkZXN0OiAnYWRkcmVzcycsXG4gIH1dLFxuXG4gIFtbJy1wJywgJy0tcG9ydCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiA0NzIzLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICB0eXBlOiAnaW50JyxcbiAgICBleGFtcGxlOiAnNDcyMycsXG4gICAgaGVscDogJ3BvcnQgdG8gbGlzdGVuIG9uJyxcbiAgICBkZXN0OiAncG9ydCcsXG4gIH1dLFxuXG4gIFtbJy1wYScsICctLWJhc2UtcGF0aCddLCB7XG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlZmF1bHRWYWx1ZTogREVGQVVMVF9CQVNFX1BBVEgsXG4gICAgZGVzdDogJ2Jhc2VQYXRoJyxcbiAgICBleGFtcGxlOiAnL3BhdGgvcHJlZml4JyxcbiAgICBoZWxwOiAnQmFzZSBwYXRoIHRvIHVzZSBhcyB0aGUgcHJlZml4IGZvciBhbGwgd2ViZHJpdmVyIHJvdXRlcyBydW5uaW5nJyArXG4gICAgICAgICAgYG9uIHRoaXMgc2VydmVyIChkZWZhdWx0OiAke0RFRkFVTFRfQkFTRV9QQVRIfSlgXG4gIH1dLFxuXG4gIFtbJy1jYScsICctLWNhbGxiYWNrLWFkZHJlc3MnXSwge1xuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXN0OiAnY2FsbGJhY2tBZGRyZXNzJyxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZXhhbXBsZTogJzEyNy4wLjAuMScsXG4gICAgaGVscDogJ2NhbGxiYWNrIElQIEFkZHJlc3MgKGRlZmF1bHQ6IHNhbWUgYXMgLS1hZGRyZXNzKScsXG4gIH1dLFxuXG4gIFtbJy1jcCcsICctLWNhbGxiYWNrLXBvcnQnXSwge1xuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXN0OiAnY2FsbGJhY2tQb3J0JyxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgdHlwZTogJ2ludCcsXG4gICAgZXhhbXBsZTogJzQ3MjMnLFxuICAgIGhlbHA6ICdjYWxsYmFjayBwb3J0IChkZWZhdWx0OiBzYW1lIGFzIHBvcnQpJyxcbiAgfV0sXG5cbiAgW1snLWJwJywgJy0tYm9vdHN0cmFwLXBvcnQnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogNDcyNCxcbiAgICBkZXN0OiAnYm9vdHN0cmFwUG9ydCcsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIHR5cGU6ICdpbnQnLFxuICAgIGV4YW1wbGU6ICc0NzI0JyxcbiAgICBoZWxwOiAnKEFuZHJvaWQtb25seSkgcG9ydCB0byB1c2Ugb24gZGV2aWNlIHRvIHRhbGsgdG8gQXBwaXVtJyxcbiAgfV0sXG5cbiAgW1snLXInLCAnLS1iYWNrZW5kLXJldHJpZXMnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogMyxcbiAgICBkZXN0OiAnYmFja2VuZFJldHJpZXMnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICB0eXBlOiAnaW50JyxcbiAgICBleGFtcGxlOiAnMycsXG4gICAgaGVscDogJyhpT1Mtb25seSkgSG93IG1hbnkgdGltZXMgdG8gcmV0cnkgbGF1bmNoaW5nIEluc3RydW1lbnRzICcgK1xuICAgICAgICAgICdiZWZvcmUgc2F5aW5nIGl0IGNyYXNoZWQgb3IgdGltZWQgb3V0JyxcbiAgfV0sXG5cbiAgW1snLS1zZXNzaW9uLW92ZXJyaWRlJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdzZXNzaW9uT3ZlcnJpZGUnLFxuICAgIGFjdGlvbjogJ3N0b3JlVHJ1ZScsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGhlbHA6ICdFbmFibGVzIHNlc3Npb24gb3ZlcnJpZGUgKGNsb2JiZXJpbmcpJyxcbiAgICBuYXJnczogMCxcbiAgfV0sXG5cbiAgW1snLWwnLCAnLS1wcmUtbGF1bmNoJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdsYXVuY2gnLFxuICAgIGFjdGlvbjogJ3N0b3JlVHJ1ZScsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGhlbHA6ICdQcmUtbGF1bmNoIHRoZSBhcHBsaWNhdGlvbiBiZWZvcmUgYWxsb3dpbmcgdGhlIGZpcnN0IHNlc3Npb24gJyArXG4gICAgICAgICAgJyhSZXF1aXJlcyAtLWFwcCBhbmQsIGZvciBBbmRyb2lkLCAtLWFwcC1wa2cgYW5kIC0tYXBwLWFjdGl2aXR5KScsXG4gICAgbmFyZ3M6IDAsXG4gIH1dLFxuXG4gIFtbJy1nJywgJy0tbG9nJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ2xvZ0ZpbGUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnL3BhdGgvdG8vYXBwaXVtLmxvZycsXG4gICAgaGVscDogJ0Fsc28gc2VuZCBsb2cgb3V0cHV0IHRvIHRoaXMgZmlsZScsXG4gIH1dLFxuXG4gIFtbJy0tbG9nLWxldmVsJ10sIHtcbiAgICBjaG9pY2VzOiBbXG4gICAgICAnaW5mbycsICdpbmZvOmRlYnVnJywgJ2luZm86aW5mbycsICdpbmZvOndhcm4nLCAnaW5mbzplcnJvcicsXG4gICAgICAnd2FybicsICd3YXJuOmRlYnVnJywgJ3dhcm46aW5mbycsICd3YXJuOndhcm4nLCAnd2FybjplcnJvcicsXG4gICAgICAnZXJyb3InLCAnZXJyb3I6ZGVidWcnLCAnZXJyb3I6aW5mbycsICdlcnJvcjp3YXJuJywgJ2Vycm9yOmVycm9yJyxcbiAgICAgICdkZWJ1ZycsICdkZWJ1ZzpkZWJ1ZycsICdkZWJ1ZzppbmZvJywgJ2RlYnVnOndhcm4nLCAnZGVidWc6ZXJyb3InLFxuICAgIF0sXG4gICAgZGVmYXVsdFZhbHVlOiAnZGVidWcnLFxuICAgIGRlc3Q6ICdsb2dsZXZlbCcsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGV4YW1wbGU6ICdkZWJ1ZycsXG4gICAgaGVscDogJ2xvZyBsZXZlbDsgZGVmYXVsdCAoY29uc29sZVs6ZmlsZV0pOiBkZWJ1Z1s6ZGVidWddJyxcbiAgfV0sXG5cbiAgW1snLS1sb2ctdGltZXN0YW1wJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnU2hvdyB0aW1lc3RhbXBzIGluIGNvbnNvbGUgb3V0cHV0JyxcbiAgICBuYXJnczogMCxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIGRlc3Q6ICdsb2dUaW1lc3RhbXAnLFxuICB9XSxcblxuICBbWyctLWxvY2FsLXRpbWV6b25lJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnVXNlIGxvY2FsIHRpbWV6b25lIGZvciB0aW1lc3RhbXBzJyxcbiAgICBuYXJnczogMCxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIGRlc3Q6ICdsb2NhbFRpbWV6b25lJyxcbiAgfV0sXG5cbiAgW1snLS1sb2ctbm8tY29sb3JzJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnRG8gbm90IHVzZSBjb2xvcnMgaW4gY29uc29sZSBvdXRwdXQnLFxuICAgIG5hcmdzOiAwLFxuICAgIGFjdGlvbjogJ3N0b3JlVHJ1ZScsXG4gICAgZGVzdDogJ2xvZ05vQ29sb3JzJyxcbiAgfV0sXG5cbiAgW1snLUcnLCAnLS13ZWJob29rJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGV4YW1wbGU6ICdsb2NhbGhvc3Q6OTg3NicsXG4gICAgZGVzdDogJ3dlYmhvb2snLFxuICAgIGhlbHA6ICdBbHNvIHNlbmQgbG9nIG91dHB1dCB0byB0aGlzIEhUVFAgbGlzdGVuZXInLFxuICB9XSxcblxuICBbWyctLXNhZmFyaSddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIGRlc3Q6ICdzYWZhcmknLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnKElPUy1Pbmx5KSBVc2UgdGhlIHNhZmFyaSBhcHAnLFxuICAgIG5hcmdzOiAwLFxuICB9XSxcblxuICBbWyctLWRlZmF1bHQtZGV2aWNlJywgJy1kZCddLCB7XG4gICAgZGVzdDogJ2RlZmF1bHREZXZpY2UnLFxuICAgIGRlZmF1bHRWYWx1ZTogZmFsc2UsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJyhJT1MtU2ltdWxhdG9yLW9ubHkpIHVzZSB0aGUgZGVmYXVsdCBzaW11bGF0b3IgdGhhdCBpbnN0cnVtZW50cyAnICtcbiAgICAgICAgICAnbGF1bmNoZXMgb24gaXRzIG93bicsXG4gIH1dLFxuXG4gIFtbJy0tZm9yY2UtaXBob25lJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdmb3JjZUlwaG9uZScsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJyhJT1Mtb25seSkgVXNlIHRoZSBpUGhvbmUgU2ltdWxhdG9yIG5vIG1hdHRlciB3aGF0IHRoZSBhcHAgd2FudHMnLFxuICAgIG5hcmdzOiAwLFxuICB9XSxcblxuICBbWyctLWZvcmNlLWlwYWQnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogZmFsc2UsXG4gICAgZGVzdDogJ2ZvcmNlSXBhZCcsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJyhJT1Mtb25seSkgVXNlIHRoZSBpUGFkIFNpbXVsYXRvciBubyBtYXR0ZXIgd2hhdCB0aGUgYXBwIHdhbnRzJyxcbiAgICBuYXJnczogMCxcbiAgfV0sXG5cbiAgW1snLS10cmFjZXRlbXBsYXRlJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ2F1dG9tYXRpb25UcmFjZVRlbXBsYXRlUGF0aCcsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGV4YW1wbGU6ICcvVXNlcnMvbWUvQXV0b21hdGlvbi50cmFjZXRlbXBsYXRlJyxcbiAgICBoZWxwOiAnKElPUy1vbmx5KSAudHJhY2V0ZW1wbGF0ZSBmaWxlIHRvIHVzZSB3aXRoIEluc3RydW1lbnRzJyxcbiAgfV0sXG5cbiAgW1snLS1pbnN0cnVtZW50cyddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIGRlc3Q6ICdpbnN0cnVtZW50c1BhdGgnLFxuICAgIHJlcXVpcmU6IGZhbHNlLFxuICAgIGV4YW1wbGU6ICcvcGF0aC90by9pbnN0cnVtZW50cycsXG4gICAgaGVscDogJyhJT1Mtb25seSkgcGF0aCB0byBpbnN0cnVtZW50cyBiaW5hcnknLFxuICB9XSxcblxuICBbWyctLW5vZGVjb25maWcnXSwge1xuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ25vZGVjb25maWcnLFxuICAgIGhlbHA6ICdDb25maWd1cmF0aW9uIEpTT04gZmlsZSB0byByZWdpc3RlciBhcHBpdW0gd2l0aCBzZWxlbml1bSBncmlkJyxcbiAgICBleGFtcGxlOiAnL2Ficy9wYXRoL3RvL25vZGVjb25maWcuanNvbicsXG4gIH1dLFxuXG4gIFtbJy1yYScsICctLXJvYm90LWFkZHJlc3MnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogJzAuMC4wLjAnLFxuICAgIGRlc3Q6ICdyb2JvdEFkZHJlc3MnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnMC4wLjAuMCcsXG4gICAgaGVscDogJ0lQIEFkZHJlc3Mgb2Ygcm9ib3QnLFxuICB9XSxcblxuICBbWyctcnAnLCAnLS1yb2JvdC1wb3J0J10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IC0xLFxuICAgIGRlc3Q6ICdyb2JvdFBvcnQnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICB0eXBlOiAnaW50JyxcbiAgICBleGFtcGxlOiAnNDI0MicsXG4gICAgaGVscDogJ3BvcnQgZm9yIHJvYm90JyxcbiAgfV0sXG5cbiAgW1snLS1jaHJvbWVkcml2ZXItcG9ydCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIGRlc3Q6ICdjaHJvbWVEcml2ZXJQb3J0JyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgdHlwZTogJ2ludCcsXG4gICAgZXhhbXBsZTogJzk1MTUnLFxuICAgIGhlbHA6ICdQb3J0IHVwb24gd2hpY2ggQ2hyb21lRHJpdmVyIHdpbGwgcnVuLiBJZiBub3QgZ2l2ZW4sIEFuZHJvaWQgZHJpdmVyIHdpbGwgcGljayBhIHJhbmRvbSBhdmFpbGFibGUgcG9ydC4nLFxuICB9XSxcblxuICBbWyctLWNocm9tZWRyaXZlci1leGVjdXRhYmxlJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ2Nocm9tZWRyaXZlckV4ZWN1dGFibGUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnQ2hyb21lRHJpdmVyIGV4ZWN1dGFibGUgZnVsbCBwYXRoJyxcbiAgfV0sXG5cbiAgW1snLS1zaG93LWNvbmZpZyddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBkZXN0OiAnc2hvd0NvbmZpZycsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJ1Nob3cgaW5mbyBhYm91dCB0aGUgYXBwaXVtIHNlcnZlciBjb25maWd1cmF0aW9uIGFuZCBleGl0JyxcbiAgfV0sXG5cbiAgW1snLS1uby1wZXJtcy1jaGVjayddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBkZXN0OiAnbm9QZXJtc0NoZWNrJyxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnQnlwYXNzIEFwcGl1bVxcJ3MgY2hlY2tzIHRvIGVuc3VyZSB3ZSBjYW4gcmVhZC93cml0ZSBuZWNlc3NhcnkgZmlsZXMnLFxuICB9XSxcblxuICBbWyctLXN0cmljdC1jYXBzJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdlbmZvcmNlU3RyaWN0Q2FwcycsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJ0NhdXNlIHNlc3Npb25zIHRvIGZhaWwgaWYgZGVzaXJlZCBjYXBzIGFyZSBzZW50IGluIHRoYXQgQXBwaXVtICcgK1xuICAgICAgICAgICdkb2VzIG5vdCByZWNvZ25pemUgYXMgdmFsaWQgZm9yIHRoZSBzZWxlY3RlZCBkZXZpY2UnLFxuICAgIG5hcmdzOiAwLFxuICB9XSxcblxuICBbWyctLWlzb2xhdGUtc2ltLWRldmljZSddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBkZXN0OiAnaXNvbGF0ZVNpbURldmljZScsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJ1hjb2RlIDYgaGFzIGEgYnVnIG9uIHNvbWUgcGxhdGZvcm1zIHdoZXJlIGEgY2VydGFpbiBzaW11bGF0b3IgJyArXG4gICAgICAgICAgJ2NhbiBvbmx5IGJlIGxhdW5jaGVkIHdpdGhvdXQgZXJyb3IgaWYgYWxsIG90aGVyIHNpbXVsYXRvciBkZXZpY2VzICcgK1xuICAgICAgICAgICdhcmUgZmlyc3QgZGVsZXRlZC4gVGhpcyBvcHRpb24gY2F1c2VzIEFwcGl1bSB0byBkZWxldGUgYWxsICcgK1xuICAgICAgICAgICdkZXZpY2VzIG90aGVyIHRoYW4gdGhlIG9uZSBiZWluZyB1c2VkIGJ5IEFwcGl1bS4gTm90ZSB0aGF0IHRoaXMgJyArXG4gICAgICAgICAgJ2lzIGEgcGVybWFuZW50IGRlbGV0aW9uLCBhbmQgeW91IGFyZSByZXNwb25zaWJsZSBmb3IgdXNpbmcgc2ltY3RsICcgK1xuICAgICAgICAgICdvciB4Y29kZSB0byBtYW5hZ2UgdGhlIGNhdGVnb3JpZXMgb2YgZGV2aWNlcyB1c2VkIHdpdGggQXBwaXVtLicsXG4gICAgbmFyZ3M6IDAsXG4gIH1dLFxuXG4gIFtbJy0tdG1wJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ3RtcERpcicsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGhlbHA6ICdBYnNvbHV0ZSBwYXRoIHRvIGRpcmVjdG9yeSBBcHBpdW0gY2FuIHVzZSB0byBtYW5hZ2UgdGVtcG9yYXJ5ICcgK1xuICAgICAgICAgICdmaWxlcywgbGlrZSBidWlsdC1pbiBpT1MgYXBwcyBpdCBuZWVkcyB0byBtb3ZlIGFyb3VuZC4gT24gKm5peC9NYWMgJyArXG4gICAgICAgICAgJ2RlZmF1bHRzIHRvIC90bXAsIG9uIFdpbmRvd3MgZGVmYXVsdHMgdG8gQzpcXFxcV2luZG93c1xcXFxUZW1wJyxcbiAgfV0sXG5cbiAgW1snLS10cmFjZS1kaXInXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICBkZXN0OiAndHJhY2VEaXInLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnQWJzb2x1dGUgcGF0aCB0byBkaXJlY3RvcnkgQXBwaXVtIHVzZSB0byBzYXZlIGlvcyBpbnN0cnVtZW50cyAnICtcbiAgICAgICAgICAndHJhY2VzLCBkZWZhdWx0cyB0byA8dG1wIGRpcj4vYXBwaXVtLWluc3RydW1lbnRzJyxcbiAgfV0sXG5cbiAgW1snLS1kZWJ1Zy1sb2ctc3BhY2luZyddLCB7XG4gICAgZGVzdDogJ2RlYnVnTG9nU3BhY2luZycsXG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnQWRkIGV4YWdnZXJhdGVkIHNwYWNpbmcgaW4gbG9ncyB0byBoZWxwIHdpdGggdmlzdWFsIGluc3BlY3Rpb24nLFxuICB9XSxcblxuICBbWyctLXN1cHByZXNzLWFkYi1raWxsLXNlcnZlciddLCB7XG4gICAgZGVzdDogJ3N1cHByZXNzS2lsbFNlcnZlcicsXG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnKEFuZHJvaWQtb25seSkgSWYgc2V0LCBwcmV2ZW50cyBBcHBpdW0gZnJvbSBraWxsaW5nIHRoZSBhZGIgc2VydmVyIGluc3RhbmNlJyxcbiAgICBuYXJnczogMCxcbiAgfV0sXG5cbiAgW1snLS1sb25nLXN0YWNrdHJhY2UnXSwge1xuICAgIGRlc3Q6ICdsb25nU3RhY2t0cmFjZScsXG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICBoZWxwOiAnQWRkIGxvbmcgc3RhY2sgdHJhY2VzIHRvIGxvZyBlbnRyaWVzLiBSZWNvbW1lbmRlZCBmb3IgZGVidWdnaW5nIG9ubHkuJyxcbiAgfV0sXG5cbiAgW1snLS13ZWJraXQtZGVidWctcHJveHktcG9ydCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiAyNzc1MyxcbiAgICBkZXN0OiAnd2Via2l0RGVidWdQcm94eVBvcnQnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICB0eXBlOiAnaW50JyxcbiAgICBleGFtcGxlOiAnMjc3NTMnLFxuICAgIGhlbHA6ICcoSU9TLW9ubHkpIExvY2FsIHBvcnQgdXNlZCBmb3IgY29tbXVuaWNhdGlvbiB3aXRoIGlvcy13ZWJraXQtZGVidWctcHJveHknXG4gIH1dLFxuXG4gIFtbJy0td2ViZHJpdmVyYWdlbnQtcG9ydCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiA4MTAwLFxuICAgIGRlc3Q6ICd3ZGFMb2NhbFBvcnQnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICB0eXBlOiAnaW50JyxcbiAgICBleGFtcGxlOiAnODEwMCcsXG4gICAgaGVscDogJyhJT1Mtb25seSwgWENVSVRlc3Qtb25seSkgTG9jYWwgcG9ydCB1c2VkIGZvciBjb21tdW5pY2F0aW9uIHdpdGggV2ViRHJpdmVyQWdlbnQnXG4gIH1dLFxuXG4gIFtbJy1kYycsICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJ10sIHtcbiAgICBkZXN0OiAnZGVmYXVsdENhcGFiaWxpdGllcycsXG4gICAgZGVmYXVsdFZhbHVlOiB7fSxcbiAgICB0eXBlOiBwYXJzZURlZmF1bHRDYXBzLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnWyBcXCd7XCJhcHBcIjogXCJteWFwcC5hcHBcIiwgXCJkZXZpY2VOYW1lXCI6IFwiaVBob25lIFNpbXVsYXRvclwifVxcJyAnICtcbiAgICAgICAgICAgICAnfCAvcGF0aC90by9jYXBzLmpzb24gXScsXG4gICAgaGVscDogJ1NldCB0aGUgZGVmYXVsdCBkZXNpcmVkIGNhcGFiaWxpdGllcywgd2hpY2ggd2lsbCBiZSBzZXQgb24gZWFjaCAnICtcbiAgICAgICAgICAnc2Vzc2lvbiB1bmxlc3Mgb3ZlcnJpZGRlbiBieSByZWNlaXZlZCBjYXBhYmlsaXRpZXMuJ1xuICB9XSxcblxuICBbWyctLXJlbGF4ZWQtc2VjdXJpdHknXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogZmFsc2UsXG4gICAgZGVzdDogJ3JlbGF4ZWRTZWN1cml0eUVuYWJsZWQnLFxuICAgIGFjdGlvbjogJ3N0b3JlVHJ1ZScsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGhlbHA6ICdEaXNhYmxlIGFkZGl0aW9uYWwgc2VjdXJpdHkgY2hlY2tzLCBzbyBpdCBpcyBwb3NzaWJsZSB0byB1c2Ugc29tZSBhZHZhbmNlZCBmZWF0dXJlcywgcHJvdmlkZWQgJyArXG4gICAgICAgICAgJ2J5IGRyaXZlcnMgc3VwcG9ydGluZyB0aGlzIG9wdGlvbi4gT25seSBlbmFibGUgaXQgaWYgYWxsIHRoZSAnICtcbiAgICAgICAgICAnY2xpZW50cyBhcmUgaW4gdGhlIHRydXN0ZWQgbmV0d29yayBhbmQgaXRcXCdzIG5vdCB0aGUgY2FzZSBpZiBhIGNsaWVudCBjb3VsZCBwb3RlbnRpYWxseSAnICtcbiAgICAgICAgICAnYnJlYWsgb3V0IG9mIHRoZSBzZXNzaW9uIHNhbmRib3guIFNwZWNpZmljIGZlYXR1cmVzIGNhbiBiZSBvdmVycmlkZGVuIGJ5ICcgK1xuICAgICAgICAgICd1c2luZyB0aGUgLS1kZW55LWluc2VjdXJlIGZsYWcnLFxuICAgIG5hcmdzOiAwXG4gIH1dLFxuXG4gIFtbJy0tYWxsb3ctaW5zZWN1cmUnXSwge1xuICAgIGRlc3Q6ICdhbGxvd0luc2VjdXJlJyxcbiAgICBkZWZhdWx0VmFsdWU6IFtdLFxuICAgIHR5cGU6IHBhcnNlU2VjdXJpdHlGZWF0dXJlcyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ2V4ZWN1dGVfZHJpdmVyX3NjcmlwdCxhZGJfc2hlbGwnLFxuICAgIGhlbHA6ICdTZXQgd2hpY2ggaW5zZWN1cmUgZmVhdHVyZXMgYXJlIGFsbG93ZWQgdG8gcnVuIGluIHRoaXMgc2VydmVyXFwncyBzZXNzaW9ucy4gJyArXG4gICAgICAgICAgJ0ZlYXR1cmVzIGFyZSBkZWZpbmVkIG9uIGEgZHJpdmVyIGxldmVsOyBzZWUgZG9jdW1lbnRhdGlvbiBmb3IgbW9yZSBkZXRhaWxzLiAnICtcbiAgICAgICAgICAnVGhpcyBzaG91bGQgYmUgZWl0aGVyIGEgY29tbWEtc2VwYXJhdGVkIGxpc3Qgb2YgZmVhdHVyZSBuYW1lcywgb3IgYSBwYXRoIHRvICcgK1xuICAgICAgICAgICdhIGZpbGUgd2hlcmUgZWFjaCBmZWF0dXJlIG5hbWUgaXMgb24gYSBsaW5lLiBOb3RlIHRoYXQgZmVhdHVyZXMgZGVmaW5lZCB2aWEgJyArXG4gICAgICAgICAgJy0tZGVueS1pbnNlY3VyZSB3aWxsIGJlIGRpc2FibGVkLCBldmVuIGlmIGFsc28gbGlzdGVkIGhlcmUuJyxcbiAgfV0sXG5cbiAgW1snLS1kZW55LWluc2VjdXJlJ10sIHtcbiAgICBkZXN0OiAnZGVueUluc2VjdXJlJyxcbiAgICBkZWZhdWx0VmFsdWU6IFtdLFxuICAgIHR5cGU6IHBhcnNlU2VjdXJpdHlGZWF0dXJlcyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ2V4ZWN1dGVfZHJpdmVyX3NjcmlwdCxhZGJfc2hlbGwnLFxuICAgIGhlbHA6ICdTZXQgd2hpY2ggaW5zZWN1cmUgZmVhdHVyZXMgYXJlIG5vdCBhbGxvd2VkIHRvIHJ1biBpbiB0aGlzIHNlcnZlclxcJ3Mgc2Vzc2lvbnMuICcgK1xuICAgICAgICAgICdGZWF0dXJlcyBhcmUgZGVmaW5lZCBvbiBhIGRyaXZlciBsZXZlbDsgc2VlIGRvY3VtZW50YXRpb24gZm9yIG1vcmUgZGV0YWlscy4gJyArXG4gICAgICAgICAgJ1RoaXMgc2hvdWxkIGJlIGVpdGhlciBhIGNvbW1hLXNlcGFyYXRlZCBsaXN0IG9mIGZlYXR1cmUgbmFtZXMsIG9yIGEgcGF0aCB0byAnICtcbiAgICAgICAgICAnYSBmaWxlIHdoZXJlIGVhY2ggZmVhdHVyZSBuYW1lIGlzIG9uIGEgbGluZS4gRmVhdHVyZXMgbGlzdGVkIGhlcmUgd2lsbCBub3QgYmUgJyArXG4gICAgICAgICAgJ2VuYWJsZWQgZXZlbiBpZiBhbHNvIGxpc3RlZCBpbiAtLWFsbG93LWluc2VjdXJlLCBhbmQgZXZlbiBpZiAtLXJlbGF4ZWQtc2VjdXJpdHkgJyArXG4gICAgICAgICAgJ2lzIHR1cm5lZCBvbi4nLFxuICB9XSxcbl07XG5cbmNvbnN0IGRlcHJlY2F0ZWRBcmdzID0gW1xuICBbWyctLWNvbW1hbmQtdGltZW91dCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiA2MCxcbiAgICBkZXN0OiAnZGVmYXVsdENvbW1hbmRUaW1lb3V0JyxcbiAgICB0eXBlOiAnaW50JyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSBObyBlZmZlY3QuIFRoaXMgdXNlZCB0byBiZSB0aGUgZGVmYXVsdCBjb21tYW5kICcgK1xuICAgICAgICAgICd0aW1lb3V0IGZvciB0aGUgc2VydmVyIHRvIHVzZSBmb3IgYWxsIHNlc3Npb25zIChpbiBzZWNvbmRzIGFuZCAnICtcbiAgICAgICAgICAnc2hvdWxkIGJlIGxlc3MgdGhhbiAyMTQ3NDgzKS4gVXNlIG5ld0NvbW1hbmRUaW1lb3V0IGNhcCBpbnN0ZWFkJ1xuICB9XSxcblxuICBbWyctaycsICctLWtlZXAtYXJ0aWZhY3RzJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdrZWVwQXJ0aWZhY3RzJyxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gbm8gZWZmZWN0LCB0cmFjZSBpcyBub3cgaW4gdG1wIGRpciBieSBkZWZhdWx0IGFuZCBpcyAnICtcbiAgICAgICAgICAnY2xlYXJlZCBiZWZvcmUgZWFjaCBydW4uIFBsZWFzZSBhbHNvIHJlZmVyIHRvIHRoZSAtLXRyYWNlLWRpciBmbGFnLicsXG4gICAgbmFyZ3M6IDAsXG4gIH1dLFxuXG4gIFtbJy0tcGxhdGZvcm0tbmFtZSddLCB7XG4gICAgZGVzdDogJ3BsYXRmb3JtTmFtZScsXG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgZXhhbXBsZTogJ2lPUycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIE5hbWUgb2YgdGhlIG1vYmlsZSBwbGF0Zm9ybTogaU9TLCBBbmRyb2lkLCBvciBGaXJlZm94T1MnLFxuICB9XSxcblxuICBbWyctLXBsYXRmb3JtLXZlcnNpb24nXSwge1xuICAgIGRlc3Q6ICdwbGF0Zm9ybVZlcnNpb24nLFxuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGV4YW1wbGU6ICc3LjEnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSBWZXJzaW9uIG9mIHRoZSBtb2JpbGUgcGxhdGZvcm0nLFxuICB9XSxcblxuICBbWyctLWF1dG9tYXRpb24tbmFtZSddLCB7XG4gICAgZGVzdDogJ2F1dG9tYXRpb25OYW1lJyxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBleGFtcGxlOiAnQXBwaXVtJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gTmFtZSBvZiB0aGUgYXV0b21hdGlvbiB0b29sOiBBcHBpdW0sIFhDVUlUZXN0LCBldGMuJyxcbiAgfV0sXG5cbiAgW1snLS1kZXZpY2UtbmFtZSddLCB7XG4gICAgZGVzdDogJ2RldmljZU5hbWUnLFxuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGV4YW1wbGU6ICdpUGhvbmUgUmV0aW5hICg0LWluY2gpLCBBbmRyb2lkIEVtdWxhdG9yJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gTmFtZSBvZiB0aGUgbW9iaWxlIGRldmljZSB0byB1c2UnLFxuICB9XSxcblxuICBbWyctLWJyb3dzZXItbmFtZSddLCB7XG4gICAgZGVzdDogJ2Jyb3dzZXJOYW1lJyxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBleGFtcGxlOiAnU2FmYXJpJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gTmFtZSBvZiB0aGUgbW9iaWxlIGJyb3dzZXI6IFNhZmFyaSBvciBDaHJvbWUnLFxuICB9XSxcblxuICBbWyctLWFwcCddLCB7XG4gICAgZGVzdDogJ2FwcCcsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIElPUzogYWJzIHBhdGggdG8gc2ltdWxhdG9yLWNvbXBpbGVkIC5hcHAgZmlsZSBvciB0aGUgYnVuZGxlX2lkIG9mIHRoZSBkZXNpcmVkIHRhcmdldCBvbiBkZXZpY2U7IEFuZHJvaWQ6IGFicyBwYXRoIHRvIC5hcGsgZmlsZScsXG4gICAgZXhhbXBsZTogJy9hYnMvcGF0aC90by9teS5hcHAnLFxuICB9XSxcblxuICBbWyctbHQnLCAnLS1sYXVuY2gtdGltZW91dCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiA5MDAwMCxcbiAgICBkZXN0OiAnbGF1bmNoVGltZW91dCcsXG4gICAgdHlwZTogJ2ludCcsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKGlPUy1vbmx5KSBob3cgbG9uZyBpbiBtcyB0byB3YWl0IGZvciBJbnN0cnVtZW50cyB0byBsYXVuY2gnLFxuICB9XSxcblxuICBbWyctLWxhbmd1YWdlJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ2xhbmd1YWdlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ2VuJyxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIExhbmd1YWdlIGZvciB0aGUgaU9TIHNpbXVsYXRvciAvIEFuZHJvaWQgRW11bGF0b3InLFxuICB9XSxcblxuICBbWyctLWxvY2FsZSddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIGRlc3Q6ICdsb2NhbGUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnZW5fVVMnLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gTG9jYWxlIGZvciB0aGUgaU9TIHNpbXVsYXRvciAvIEFuZHJvaWQgRW11bGF0b3InLFxuICB9XSxcblxuICBbWyctVScsICctLXVkaWQnXSwge1xuICAgIGRlc3Q6ICd1ZGlkJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIGV4YW1wbGU6ICcxYWRzZi1zZGZhcy1hc2RmLTEyM3NkZicsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSBVbmlxdWUgZGV2aWNlIGlkZW50aWZpZXIgb2YgdGhlIGNvbm5lY3RlZCBwaHlzaWNhbCBkZXZpY2UnLFxuICB9XSxcblxuICBbWyctLW9yaWVudGF0aW9uJ10sIHtcbiAgICBkZXN0OiAnb3JpZW50YXRpb24nLFxuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ0xBTkRTQ0FQRScsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoSU9TLW9ubHkpIHVzZSBMQU5EU0NBUEUgb3IgUE9SVFJBSVQgdG8gaW5pdGlhbGl6ZSBhbGwgcmVxdWVzdHMgJyArXG4gICAgICAgICAgJ3RvIHRoaXMgb3JpZW50YXRpb24nLFxuICB9XSxcblxuICBbWyctLW5vLXJlc2V0J10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdub1Jlc2V0JyxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIERvIG5vdCByZXNldCBhcHAgc3RhdGUgYmV0d2VlbiBzZXNzaW9ucyAoSU9TOiBkbyBub3QgZGVsZXRlIGFwcCAnICtcbiAgICAgICAgICAncGxpc3QgZmlsZXM7IEFuZHJvaWQ6IGRvIG5vdCB1bmluc3RhbGwgYXBwIGJlZm9yZSBuZXcgc2Vzc2lvbiknLFxuICAgIG5hcmdzOiAwLFxuICB9XSxcblxuICBbWyctLWZ1bGwtcmVzZXQnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogZmFsc2UsXG4gICAgZGVzdDogJ2Z1bGxSZXNldCcsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoaU9TKSBEZWxldGUgdGhlIGVudGlyZSBzaW11bGF0b3IgZm9sZGVyLiAoQW5kcm9pZCkgUmVzZXQgYXBwICcgK1xuICAgICAgICAgICdzdGF0ZSBieSB1bmluc3RhbGxpbmcgYXBwIGluc3RlYWQgb2YgY2xlYXJpbmcgYXBwIGRhdGEuIE9uICcgK1xuICAgICAgICAgICdBbmRyb2lkLCB0aGlzIHdpbGwgYWxzbyByZW1vdmUgdGhlIGFwcCBhZnRlciB0aGUgc2Vzc2lvbiBpcyBjb21wbGV0ZS4nLFxuICAgIG5hcmdzOiAwLFxuICB9XSxcblxuICBbWyctLWFwcC1wa2cnXSwge1xuICAgIGRlc3Q6ICdhcHBQYWNrYWdlJyxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBleGFtcGxlOiAnY29tLmV4YW1wbGUuYW5kcm9pZC5teUFwcCcsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIEphdmEgcGFja2FnZSBvZiB0aGUgQW5kcm9pZCBhcHAgeW91IHdhbnQgdG8gcnVuICcgK1xuICAgICAgICAgICcoZS5nLiwgY29tLmV4YW1wbGUuYW5kcm9pZC5teUFwcCknLFxuICB9XSxcblxuICBbWyctLWFwcC1hY3Rpdml0eSddLCB7XG4gICAgZGVzdDogJ2FwcEFjdGl2aXR5JyxcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGV4YW1wbGU6ICdNYWluQWN0aXZpdHknLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKEFuZHJvaWQtb25seSkgQWN0aXZpdHkgbmFtZSBmb3IgdGhlIEFuZHJvaWQgYWN0aXZpdHkgeW91IHdhbnQgJyArXG4gICAgICAgICAgJ3RvIGxhdW5jaCBmcm9tIHlvdXIgcGFja2FnZSAoZS5nLiwgTWFpbkFjdGl2aXR5KScsXG4gIH1dLFxuXG4gIFtbJy0tYXBwLXdhaXQtcGFja2FnZSddLCB7XG4gICAgZGVzdDogJ2FwcFdhaXRQYWNrYWdlJyxcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnY29tLmV4YW1wbGUuYW5kcm9pZC5teUFwcCcsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoQW5kcm9pZC1vbmx5KSBQYWNrYWdlIG5hbWUgZm9yIHRoZSBBbmRyb2lkIGFjdGl2aXR5IHlvdSB3YW50ICcgK1xuICAgICAgICAgICd0byB3YWl0IGZvciAoZS5nLiwgY29tLmV4YW1wbGUuYW5kcm9pZC5teUFwcCknLFxuICB9XSxcblxuICBbWyctLWFwcC13YWl0LWFjdGl2aXR5J10sIHtcbiAgICBkZXN0OiAnYXBwV2FpdEFjdGl2aXR5JyxcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnU3BsYXNoQWN0aXZpdHknLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKEFuZHJvaWQtb25seSkgQWN0aXZpdHkgbmFtZSBmb3IgdGhlIEFuZHJvaWQgYWN0aXZpdHkgeW91IHdhbnQgJyArXG4gICAgICAgICAgJ3RvIHdhaXQgZm9yIChlLmcuLCBTcGxhc2hBY3Rpdml0eSknLFxuICB9XSxcblxuICBbWyctLWRldmljZS1yZWFkeS10aW1lb3V0J10sIHtcbiAgICBkZXN0OiAnZGV2aWNlUmVhZHlUaW1lb3V0JyxcbiAgICBkZWZhdWx0VmFsdWU6IDUsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIHR5cGU6ICdpbnQnLFxuICAgIGV4YW1wbGU6ICc1JyxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIFRpbWVvdXQgaW4gc2Vjb25kcyB3aGlsZSB3YWl0aW5nIGZvciBkZXZpY2UgdG8gYmVjb21lIHJlYWR5JyxcbiAgfV0sXG5cbiAgW1snLS1hbmRyb2lkLWNvdmVyYWdlJ10sIHtcbiAgICBkZXN0OiAnYW5kcm9pZENvdmVyYWdlJyxcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnY29tLm15LlBrZy9jb20ubXkuUGtnLmluc3RydW1lbnRhdGlvbi5NeUluc3RydW1lbnRhdGlvbicsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoQW5kcm9pZC1vbmx5KSBGdWxseSBxdWFsaWZpZWQgaW5zdHJ1bWVudGF0aW9uIGNsYXNzLiBQYXNzZWQgdG8gLXcgaW4gJyArXG4gICAgICAgICAgJ2FkYiBzaGVsbCBhbSBpbnN0cnVtZW50IC1lIGNvdmVyYWdlIHRydWUgLXcgJyxcbiAgfV0sXG5cbiAgW1snLS1hdmQnXSwge1xuICAgIGRlc3Q6ICdhdmQnLFxuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ0BkZWZhdWx0JyxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIE5hbWUgb2YgdGhlIGF2ZCB0byBsYXVuY2gnLFxuICB9XSxcblxuICBbWyctLWF2ZC1hcmdzJ10sIHtcbiAgICBkZXN0OiAnYXZkQXJncycsXG4gICAgZGVmYXVsdFZhbHVlOiBudWxsLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnLW5vLXNuYXBzaG90LWxvYWQnLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKEFuZHJvaWQtb25seSkgQWRkaXRpb25hbCBlbXVsYXRvciBhcmd1bWVudHMgdG8gbGF1bmNoIHRoZSBhdmQnLFxuICB9XSxcblxuICBbWyctLXVzZS1rZXlzdG9yZSddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBkZXN0OiAndXNlS2V5c3RvcmUnLFxuICAgIGFjdGlvbjogJ3N0b3JlVHJ1ZScsXG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKEFuZHJvaWQtb25seSkgV2hlbiBzZXQgdGhlIGtleXN0b3JlIHdpbGwgYmUgdXNlZCB0byBzaWduIGFwa3MuJyxcbiAgfV0sXG5cbiAgW1snLS1rZXlzdG9yZS1wYXRoJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IHBhdGgucmVzb2x2ZShwcm9jZXNzLmVudi5IT01FIHx8IHByb2Nlc3MuZW52LlVTRVJQUk9GSUxFIHx8ICcnLCAnLmFuZHJvaWQnLCAnZGVidWcua2V5c3RvcmUnKSxcbiAgICBkZXN0OiAna2V5c3RvcmVQYXRoJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoQW5kcm9pZC1vbmx5KSBQYXRoIHRvIGtleXN0b3JlJyxcbiAgfV0sXG5cbiAgW1snLS1rZXlzdG9yZS1wYXNzd29yZCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiAnYW5kcm9pZCcsXG4gICAgZGVzdDogJ2tleXN0b3JlUGFzc3dvcmQnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIFBhc3N3b3JkIHRvIGtleXN0b3JlJyxcbiAgfV0sXG5cbiAgW1snLS1rZXktYWxpYXMnXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogJ2FuZHJvaWRkZWJ1Z2tleScsXG4gICAgZGVzdDogJ2tleUFsaWFzJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoQW5kcm9pZC1vbmx5KSBLZXkgYWxpYXMnLFxuICB9XSxcblxuICBbWyctLWtleS1wYXNzd29yZCddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiAnYW5kcm9pZCcsXG4gICAgZGVzdDogJ2tleVBhc3N3b3JkJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoQW5kcm9pZC1vbmx5KSBLZXkgcGFzc3dvcmQnLFxuICB9XSxcblxuICBbWyctLWludGVudC1hY3Rpb24nXSwge1xuICAgIGRlc3Q6ICdpbnRlbnRBY3Rpb24nLFxuICAgIGRlZmF1bHRWYWx1ZTogJ2FuZHJvaWQuaW50ZW50LmFjdGlvbi5NQUlOJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ2FuZHJvaWQuaW50ZW50LmFjdGlvbi5NQUlOJyxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIEludGVudCBhY3Rpb24gd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHN0YXJ0IGFjdGl2aXR5JyxcbiAgfV0sXG5cbiAgW1snLS1pbnRlbnQtY2F0ZWdvcnknXSwge1xuICAgIGRlc3Q6ICdpbnRlbnRDYXRlZ29yeScsXG4gICAgZGVmYXVsdFZhbHVlOiAnYW5kcm9pZC5pbnRlbnQuY2F0ZWdvcnkuTEFVTkNIRVInLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBleGFtcGxlOiAnYW5kcm9pZC5pbnRlbnQuY2F0ZWdvcnkuQVBQX0NPTlRBQ1RTJyxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIEludGVudCBjYXRlZ29yeSB3aGljaCB3aWxsIGJlIHVzZWQgdG8gc3RhcnQgYWN0aXZpdHknLFxuICB9XSxcblxuICBbWyctLWludGVudC1mbGFncyddLCB7XG4gICAgZGVzdDogJ2ludGVudEZsYWdzJyxcbiAgICBkZWZhdWx0VmFsdWU6ICcweDEwMjAwMDAwJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJzB4MTAyMDAwMDAnLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKEFuZHJvaWQtb25seSkgRmxhZ3MgdGhhdCB3aWxsIGJlIHVzZWQgdG8gc3RhcnQgYWN0aXZpdHknLFxuICB9XSxcblxuICBbWyctLWludGVudC1hcmdzJ10sIHtcbiAgICBkZXN0OiAnb3B0aW9uYWxJbnRlbnRBcmd1bWVudHMnLFxuICAgIGRlZmF1bHRWYWx1ZTogbnVsbCxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJzB4MTAyMDAwMDAnLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWRlZmF1bHQtY2FwYWJpbGl0aWVzJyxcbiAgICBoZWxwOiAnW0RFUFJFQ0FURURdIC0gKEFuZHJvaWQtb25seSkgQWRkaXRpb25hbCBpbnRlbnQgYXJndW1lbnRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvICcgK1xuICAgICAgICAgICdzdGFydCBhY3Rpdml0eScsXG4gIH1dLFxuXG4gIFtbJy0tZG9udC1zdG9wLWFwcC1vbi1yZXNldCddLCB7XG4gICAgZGVzdDogJ2RvbnRTdG9wQXBwT25SZXNldCcsXG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChBbmRyb2lkLW9ubHkpIFdoZW4gaW5jbHVkZWQsIHJlZnJhaW5zIGZyb20gc3RvcHBpbmcgdGhlIGFwcCBiZWZvcmUgcmVzdGFydCcsXG4gIH1dLFxuXG4gIFtbJy0tY2FsZW5kYXItZm9ybWF0J10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IG51bGwsXG4gICAgZGVzdDogJ2NhbGVuZGFyRm9ybWF0JyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZXhhbXBsZTogJ2dyZWdvcmlhbicsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoSU9TLW9ubHkpIGNhbGVuZGFyIGZvcm1hdCBmb3IgdGhlIGlPUyBzaW11bGF0b3InLFxuICB9XSxcblxuICBbWyctLW5hdGl2ZS1pbnN0cnVtZW50cy1saWInXSwge1xuICAgIGRlZmF1bHRWYWx1ZTogZmFsc2UsXG4gICAgZGVzdDogJ25hdGl2ZUluc3RydW1lbnRzTGliJyxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChJT1Mtb25seSkgSU9TIGhhcyBhIHdlaXJkIGJ1aWx0LWluIHVuYXZvaWRhYmxlICcgK1xuICAgICAgICAgICdkZWxheS4gV2UgcGF0Y2ggdGhpcyBpbiBhcHBpdW0uIElmIHlvdSBkbyBub3Qgd2FudCBpdCBwYXRjaGVkLCAnICtcbiAgICAgICAgICAncGFzcyBpbiB0aGlzIGZsYWcuJyxcbiAgICBuYXJnczogMCxcbiAgfV0sXG5cbiAgW1snLS1rZWVwLWtleWNoYWlucyddLCB7XG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgICBkZXN0OiAna2VlcEtleUNoYWlucycsXG4gICAgYWN0aW9uOiAnc3RvcmVUcnVlJyxcbiAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgZGVwcmVjYXRlZEZvcjogJy0tZGVmYXVsdC1jYXBhYmlsaXRpZXMnLFxuICAgIGhlbHA6ICdbREVQUkVDQVRFRF0gLSAoaU9TLW9ubHkpIFdoZXRoZXIgdG8ga2VlcCBrZXljaGFpbnMgKExpYnJhcnkvS2V5Y2hhaW5zKSB3aGVuIHJlc2V0IGFwcCBiZXR3ZWVuIHNlc3Npb25zJyxcbiAgICBuYXJnczogMCxcbiAgfV0sXG5cbiAgW1snLS1sb2NhbGl6YWJsZS1zdHJpbmdzLWRpciddLCB7XG4gICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgIGRlc3Q6ICdsb2NhbGl6YWJsZVN0cmluZ3NEaXInLFxuICAgIGRlZmF1bHRWYWx1ZTogJ2VuLmxwcm9qJyxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChJT1Mtb25seSkgdGhlIHJlbGF0aXZlIHBhdGggb2YgdGhlIGRpciB3aGVyZSBMb2NhbGl6YWJsZS5zdHJpbmdzIGZpbGUgcmVzaWRlcyAnLFxuICAgIGV4YW1wbGU6ICdlbi5scHJvaicsXG4gIH1dLFxuXG4gIFtbJy0tc2hvdy1pb3MtbG9nJ10sIHtcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIGRlc3Q6ICdzaG93SU9TTG9nJyxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBkZXByZWNhdGVkRm9yOiAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIChJT1Mtb25seSkgaWYgc2V0LCB0aGUgaU9TIHN5c3RlbSBsb2cgd2lsbCBiZSB3cml0dGVuIHRvIHRoZSBjb25zb2xlJyxcbiAgICBuYXJnczogMCxcbiAgfV0sXG5cbiAgW1snLS1hc3luYy10cmFjZSddLCB7XG4gICAgZGVzdDogJ2xvbmdTdGFja3RyYWNlJyxcbiAgICBkZWZhdWx0VmFsdWU6IGZhbHNlLFxuICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICBhY3Rpb246ICdzdG9yZVRydWUnLFxuICAgIGRlcHJlY2F0ZWRGb3I6ICctLWxvbmctc3RhY2t0cmFjZScsXG4gICAgaGVscDogJ1tERVBSRUNBVEVEXSAtIEFkZCBsb25nIHN0YWNrIHRyYWNlcyB0byBsb2cgZW50cmllcy4gUmVjb21tZW5kZWQgZm9yIGRlYnVnZ2luZyBvbmx5LicsXG4gIH1dLFxuXTtcblxuZnVuY3Rpb24gdXBkYXRlUGFyc2VBcmdzRm9yRGVmYXVsdENhcGFiaWxpdGllcyAocGFyc2VyKSB7XG4gIC8vIGhlcmUgd2Ugd2FudCB0byB1cGRhdGUgdGhlIHBhcnNlci5wYXJzZUFyZ3MoKSBmdW5jdGlvblxuICAvLyBpbiBvcmRlciB0byBicmluZyB0b2dldGhlciBhbGwgdGhlIGFyZ3MgdGhhdCBhcmUgYWN0dWFsbHlcbiAgLy8gZGVmYXVsdCBjYXBzLlxuICAvLyBvbmNlIHRob3NlIGRlcHJlY2F0ZWQgYXJncyBhcmUgYWN0dWFsbHkgcmVtb3ZlZCwgdGhpc1xuICAvLyBjYW4gYWxzbyBiZSByZW1vdmVkXG4gIHBhcnNlci5fcGFyc2VBcmdzID0gcGFyc2VyLnBhcnNlQXJncztcbiAgcGFyc2VyLnBhcnNlQXJncyA9IGZ1bmN0aW9uIHBhcnNlQXJncyAoYXJncykge1xuICAgIGxldCBwYXJzZWRBcmdzID0gcGFyc2VyLl9wYXJzZUFyZ3MoYXJncyk7XG4gICAgcGFyc2VkQXJncy5kZWZhdWx0Q2FwYWJpbGl0aWVzID0gcGFyc2VkQXJncy5kZWZhdWx0Q2FwYWJpbGl0aWVzIHx8IHt9O1xuICAgIGZvciAobGV0IGFyZ0VudHJ5IG9mIGRlcHJlY2F0ZWRBcmdzKSB7XG4gICAgICBsZXQgYXJnID0gYXJnRW50cnlbMV0uZGVzdDtcbiAgICAgIGlmIChhcmdFbnRyeVsxXS5kZXByZWNhdGVkRm9yID09PSAnLS1kZWZhdWx0LWNhcGFiaWxpdGllcycpIHtcbiAgICAgICAgaWYgKGFyZyBpbiBwYXJzZWRBcmdzICYmIHBhcnNlZEFyZ3NbYXJnXSAhPT0gYXJnRW50cnlbMV0uZGVmYXVsdFZhbHVlKSB7XG4gICAgICAgICAgcGFyc2VkQXJncy5kZWZhdWx0Q2FwYWJpbGl0aWVzW2FyZ10gPSBwYXJzZWRBcmdzW2FyZ107XG4gICAgICAgICAgLy8gaiBzIGggaSBuIHQgY2FuJ3QgaGFuZGxlIGNvbXBsZXggaW50ZXJwb2xhdGVkIHN0cmluZ3NcbiAgICAgICAgICBsZXQgY2FwRGljdCA9IHtbYXJnXTogcGFyc2VkQXJnc1thcmddfTtcbiAgICAgICAgICBhcmdFbnRyeVsxXS5kZXByZWNhdGVkRm9yID0gYC0tZGVmYXVsdC1jYXBhYmlsaXRpZXMgYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGAnJHtKU09OLnN0cmluZ2lmeShjYXBEaWN0KX0nYDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGFyc2VkQXJncztcbiAgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VTZWN1cml0eUZlYXR1cmVzIChmZWF0dXJlcykge1xuICBjb25zdCBzcGxpdHRlciA9IChzcGxpdE9uLCBzdHIpID0+IGAke3N0cn1gLnNwbGl0KHNwbGl0T24pLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbik7XG4gIGxldCBwYXJzZWRGZWF0dXJlcztcbiAgdHJ5IHtcbiAgICBwYXJzZWRGZWF0dXJlcyA9IHNwbGl0dGVyKCcsJywgZmVhdHVyZXMpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBwYXJzZSB2YWx1ZSBvZiAtLWFsbG93L2RlbnktaW5zZWN1cmUuIFNob3VsZCBiZSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2EgbGlzdCBvZiBzdHJpbmdzIHNlcGFyYXRlZCBieSBjb21tYXMsIG9yIGEgcGF0aCB0byBhIGZpbGUgJyArXG4gICAgICAgICAgICAgICAgICAgICdsaXN0aW5nIG9uZSBmZWF0dXJlIG5hbWUgcGVyIGxpbmUuJyk7XG4gIH1cblxuICBpZiAocGFyc2VkRmVhdHVyZXMubGVuZ3RoID09PSAxICYmIGZzLmV4aXN0c1N5bmMocGFyc2VkRmVhdHVyZXNbMF0pKSB7XG4gICAgLy8gd2UgbWlnaHQgaGF2ZSBhIGZpbGUgd2hpY2ggaXMgYSBsaXN0IG9mIGZlYXR1cmVzXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVGZWF0dXJlcyA9IGZzLnJlYWRGaWxlU3luYyhwYXJzZWRGZWF0dXJlc1swXSwgJ3V0ZjgnKTtcbiAgICAgIHBhcnNlZEZlYXR1cmVzID0gc3BsaXR0ZXIoJ1xcbicsIGZpbGVGZWF0dXJlcyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEF0dGVtcHRlZCB0byByZWFkIC0tYWxsb3cvZGVueS1pbnNlY3VyZSBmZWF0dXJlIG5hbWVzIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBmcm9tIGZpbGUgJHtwYXJzZWRGZWF0dXJlc1swXX0gYnV0IGdvdCBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFyc2VkRmVhdHVyZXM7XG59XG5cbmZ1bmN0aW9uIHBhcnNlRGVmYXVsdENhcHMgKGNhcHMpIHtcbiAgdHJ5IHtcbiAgICAvLyB1c2Ugc3luY2hyb25vdXMgZmlsZSBhY2Nlc3MsIGFzIGBhcmdwYXJzZWAgcHJvdmlkZXMgbm8gd2F5IG9mIGVpdGhlclxuICAgIC8vIGF3YWl0aW5nIG9yIHVzaW5nIGNhbGxiYWNrcy4gVGhpcyBzdGVwIGhhcHBlbnMgaW4gc3RhcnR1cCwgaW4gd2hhdCBpc1xuICAgIC8vIGVmZmVjdGl2ZWx5IGNvbW1hbmQtbGluZSBjb2RlLCBzbyBub3RoaW5nIGlzIGJsb2NrZWQgaW4gdGVybXMgb2ZcbiAgICAvLyBzZXNzaW9ucywgc28gaG9sZGluZyB1cCB0aGUgZXZlbnQgbG9vcCBkb2VzIG5vdCBpbmN1ciB0aGUgdXN1YWxcbiAgICAvLyBkcmF3YmFja3MuXG4gICAgaWYgKGZzLnN0YXRTeW5jKGNhcHMpLmlzRmlsZSgpKSB7XG4gICAgICBjYXBzID0gZnMucmVhZEZpbGVTeW5jKGNhcHMsICd1dGY4Jyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICAvLyBub3QgYSBmaWxlLCBvciBub3QgcmVhZGFibGVcbiAgfVxuICBjYXBzID0gSlNPTi5wYXJzZShjYXBzKTtcbiAgaWYgKCFfLmlzUGxhaW5PYmplY3QoY2FwcykpIHtcbiAgICB0aHJvdyAnSW52YWxpZCBmb3JtYXQgZm9yIGRlZmF1bHQgY2FwYWJpbGl0aWVzJztcbiAgfVxuICByZXR1cm4gY2Fwcztcbn1cblxuZnVuY3Rpb24gZ2V0UGFyc2VyICgpIHtcbiAgbGV0IHBhcnNlciA9IG5ldyBBcmd1bWVudFBhcnNlcih7XG4gICAgdmVyc2lvbjogcmVxdWlyZShwYXRoLnJlc29sdmUocm9vdERpciwgJ3BhY2thZ2UuanNvbicpKS52ZXJzaW9uLFxuICAgIGFkZEhlbHA6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBIHdlYmRyaXZlci1jb21wYXRpYmxlIHNlcnZlciBmb3IgdXNlIHdpdGggbmF0aXZlIGFuZCBoeWJyaWQgaU9TIGFuZCBBbmRyb2lkIGFwcGxpY2F0aW9ucy4nLFxuICAgIHByb2c6IHByb2Nlc3MuYXJndlsxXSB8fCAnQXBwaXVtJ1xuICB9KTtcbiAgbGV0IGFsbEFyZ3MgPSBfLnVuaW9uKGFyZ3MsIGRlcHJlY2F0ZWRBcmdzKTtcbiAgcGFyc2VyLnJhd0FyZ3MgPSBhbGxBcmdzO1xuICBmb3IgKGxldCBhcmcgb2YgYWxsQXJncykge1xuICAgIHBhcnNlci5hZGRBcmd1bWVudChhcmdbMF0sIGFyZ1sxXSk7XG4gIH1cbiAgdXBkYXRlUGFyc2VBcmdzRm9yRGVmYXVsdENhcGFiaWxpdGllcyhwYXJzZXIpO1xuXG4gIHJldHVybiBwYXJzZXI7XG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRBcmdzICgpIHtcbiAgbGV0IGRlZmF1bHRzID0ge307XG4gIGZvciAobGV0IFssIGFyZ10gb2YgYXJncykge1xuICAgIGRlZmF1bHRzW2FyZy5kZXN0XSA9IGFyZy5kZWZhdWx0VmFsdWU7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRzO1xufVxuXG5leHBvcnQgZGVmYXVsdCBnZXRQYXJzZXI7XG5leHBvcnQgeyBnZXREZWZhdWx0QXJncywgZ2V0UGFyc2VyIH07XG4iXSwiZmlsZSI6ImxpYi9wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiLi4vLi4ifQ==
