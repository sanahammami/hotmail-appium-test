"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.routeToCommandName = routeToCommandName;
exports.NO_SESSION_ID_COMMANDS = exports.ALL_COMMANDS = exports.METHOD_MAP = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _appiumSupport = require("appium-support");

var _protocol = require("./protocol");

const METHOD_MAP = {
  '/status': {
    GET: {
      command: 'getStatus'
    }
  },
  '/session': {
    POST: {
      command: 'createSession',
      payloadParams: {
        validate: jsonObj => !jsonObj.capabilities && !jsonObj.desiredCapabilities && 'we require one of "desiredCapabilities" or "capabilities" object',
        optional: ['desiredCapabilities', 'requiredCapabilities', 'capabilities']
      }
    }
  },
  '/sessions': {
    GET: {
      command: 'getSessions'
    }
  },
  '/session/:sessionId': {
    GET: {
      command: 'getSession'
    },
    DELETE: {
      command: 'deleteSession'
    }
  },
  '/session/:sessionId/timeouts': {
    GET: {
      command: 'getTimeouts'
    },
    POST: {
      command: 'timeouts',
      payloadParams: {
        validate: (jsonObj, protocolName) => {
          if (protocolName === _protocol.PROTOCOLS.W3C) {
            if (!_appiumSupport.util.hasValue(jsonObj.script) && !_appiumSupport.util.hasValue(jsonObj.pageLoad) && !_appiumSupport.util.hasValue(jsonObj.implicit)) {
              return 'W3C protocol expects any of script, pageLoad or implicit to be set';
            }
          } else {
            if (!_appiumSupport.util.hasValue(jsonObj.type) || !_appiumSupport.util.hasValue(jsonObj.ms)) {
              return 'MJSONWP protocol requires type and ms';
            }
          }
        },
        optional: ['type', 'ms', 'script', 'pageLoad', 'implicit']
      }
    }
  },
  '/session/:sessionId/timeouts/async_script': {
    POST: {
      command: 'asyncScriptTimeout',
      payloadParams: {
        required: ['ms']
      }
    }
  },
  '/session/:sessionId/timeouts/implicit_wait': {
    POST: {
      command: 'implicitWait',
      payloadParams: {
        required: ['ms']
      }
    }
  },
  '/session/:sessionId/window_handle': {
    GET: {
      command: 'getWindowHandle'
    }
  },
  '/session/:sessionId/window/handle': {
    GET: {
      command: 'getWindowHandle'
    }
  },
  '/session/:sessionId/window_handles': {
    GET: {
      command: 'getWindowHandles'
    }
  },
  '/session/:sessionId/window/handles': {
    GET: {
      command: 'getWindowHandles'
    }
  },
  '/session/:sessionId/url': {
    GET: {
      command: 'getUrl'
    },
    POST: {
      command: 'setUrl',
      payloadParams: {
        required: ['url']
      }
    }
  },
  '/session/:sessionId/forward': {
    POST: {
      command: 'forward'
    }
  },
  '/session/:sessionId/back': {
    POST: {
      command: 'back'
    }
  },
  '/session/:sessionId/refresh': {
    POST: {
      command: 'refresh'
    }
  },
  '/session/:sessionId/execute': {
    POST: {
      command: 'execute',
      payloadParams: {
        required: ['script', 'args']
      }
    }
  },
  '/session/:sessionId/execute_async': {
    POST: {
      command: 'executeAsync',
      payloadParams: {
        required: ['script', 'args']
      }
    }
  },
  '/session/:sessionId/screenshot': {
    GET: {
      command: 'getScreenshot'
    }
  },
  '/session/:sessionId/ime/available_engines': {
    GET: {
      command: 'availableIMEEngines'
    }
  },
  '/session/:sessionId/ime/active_engine': {
    GET: {
      command: 'getActiveIMEEngine'
    }
  },
  '/session/:sessionId/ime/activated': {
    GET: {
      command: 'isIMEActivated'
    }
  },
  '/session/:sessionId/ime/deactivate': {
    POST: {
      command: 'deactivateIMEEngine'
    }
  },
  '/session/:sessionId/ime/activate': {
    POST: {
      command: 'activateIMEEngine',
      payloadParams: {
        required: ['engine']
      }
    }
  },
  '/session/:sessionId/frame': {
    POST: {
      command: 'setFrame',
      payloadParams: {
        required: ['id']
      }
    }
  },
  '/session/:sessionId/frame/parent': {
    POST: {}
  },
  '/session/:sessionId/window': {
    GET: {
      command: 'getWindowHandle'
    },
    POST: {
      command: 'setWindow',
      payloadParams: {
        optional: ['name', 'handle'],
        makeArgs: jsonObj => {
          if (_appiumSupport.util.hasValue(jsonObj.handle) && !_appiumSupport.util.hasValue(jsonObj.name)) {
            return [jsonObj.handle, jsonObj.handle];
          }

          if (_appiumSupport.util.hasValue(jsonObj.name) && !_appiumSupport.util.hasValue(jsonObj.handle)) {
            return [jsonObj.name, jsonObj.name];
          }

          return [jsonObj.name, jsonObj.handle];
        },
        validate: jsonObj => !_appiumSupport.util.hasValue(jsonObj.name) && !_appiumSupport.util.hasValue(jsonObj.handle) && 'we require one of "name" or "handle" to be set'
      }
    },
    DELETE: {
      command: 'closeWindow'
    }
  },
  '/session/:sessionId/window/:windowhandle/size': {
    GET: {
      command: 'getWindowSize'
    },
    POST: {}
  },
  '/session/:sessionId/window/:windowhandle/position': {
    POST: {},
    GET: {}
  },
  '/session/:sessionId/window/:windowhandle/maximize': {
    POST: {
      command: 'maximizeWindow'
    }
  },
  '/session/:sessionId/cookie': {
    GET: {
      command: 'getCookies'
    },
    POST: {
      command: 'setCookie',
      payloadParams: {
        required: ['cookie']
      }
    },
    DELETE: {
      command: 'deleteCookies'
    }
  },
  '/session/:sessionId/cookie/:name': {
    GET: {
      command: 'getCookie'
    },
    DELETE: {
      command: 'deleteCookie'
    }
  },
  '/session/:sessionId/source': {
    GET: {
      command: 'getPageSource'
    }
  },
  '/session/:sessionId/title': {
    GET: {
      command: 'title'
    }
  },
  '/session/:sessionId/element': {
    POST: {
      command: 'findElement',
      payloadParams: {
        required: ['using', 'value']
      }
    }
  },
  '/session/:sessionId/elements': {
    POST: {
      command: 'findElements',
      payloadParams: {
        required: ['using', 'value']
      }
    }
  },
  '/session/:sessionId/element/active': {
    GET: {
      command: 'active'
    },
    POST: {
      command: 'active'
    }
  },
  '/session/:sessionId/element/:elementId': {
    GET: {}
  },
  '/session/:sessionId/element/:elementId/element': {
    POST: {
      command: 'findElementFromElement',
      payloadParams: {
        required: ['using', 'value']
      }
    }
  },
  '/session/:sessionId/element/:elementId/elements': {
    POST: {
      command: 'findElementsFromElement',
      payloadParams: {
        required: ['using', 'value']
      }
    }
  },
  '/session/:sessionId/element/:elementId/click': {
    POST: {
      command: 'click'
    }
  },
  '/session/:sessionId/element/:elementId/submit': {
    POST: {
      command: 'submit'
    }
  },
  '/session/:sessionId/element/:elementId/text': {
    GET: {
      command: 'getText'
    }
  },
  '/session/:sessionId/element/:elementId/value': {
    POST: {
      command: 'setValue',
      payloadParams: {
        validate: jsonObj => !_appiumSupport.util.hasValue(jsonObj.value) && !_appiumSupport.util.hasValue(jsonObj.text) && 'we require one of "text" or "value" params',
        optional: ['value', 'text'],
        makeArgs: jsonObj => [jsonObj.value || jsonObj.text]
      }
    }
  },
  '/session/:sessionId/keys': {
    POST: {
      command: 'keys',
      payloadParams: {
        required: ['value']
      }
    }
  },
  '/session/:sessionId/element/:elementId/name': {
    GET: {
      command: 'getName'
    }
  },
  '/session/:sessionId/element/:elementId/clear': {
    POST: {
      command: 'clear'
    }
  },
  '/session/:sessionId/element/:elementId/selected': {
    GET: {
      command: 'elementSelected'
    }
  },
  '/session/:sessionId/element/:elementId/enabled': {
    GET: {
      command: 'elementEnabled'
    }
  },
  '/session/:sessionId/element/:elementId/attribute/:name': {
    GET: {
      command: 'getAttribute'
    }
  },
  '/session/:sessionId/element/:elementId/equals/:otherId': {
    GET: {
      command: 'equalsElement'
    }
  },
  '/session/:sessionId/element/:elementId/displayed': {
    GET: {
      command: 'elementDisplayed'
    }
  },
  '/session/:sessionId/element/:elementId/location': {
    GET: {
      command: 'getLocation'
    }
  },
  '/session/:sessionId/element/:elementId/location_in_view': {
    GET: {
      command: 'getLocationInView'
    }
  },
  '/session/:sessionId/element/:elementId/size': {
    GET: {
      command: 'getSize'
    }
  },
  '/session/:sessionId/element/:elementId/css/:propertyName': {
    GET: {
      command: 'getCssProperty'
    }
  },
  '/session/:sessionId/orientation': {
    GET: {
      command: 'getOrientation'
    },
    POST: {
      command: 'setOrientation',
      payloadParams: {
        required: ['orientation']
      }
    }
  },
  '/session/:sessionId/rotation': {
    GET: {
      command: 'getRotation'
    },
    POST: {
      command: 'setRotation',
      payloadParams: {
        required: ['x', 'y', 'z']
      }
    }
  },
  '/session/:sessionId/moveto': {
    POST: {
      command: 'moveTo',
      payloadParams: {
        optional: ['element', 'xoffset', 'yoffset']
      }
    }
  },
  '/session/:sessionId/click': {
    POST: {
      command: 'clickCurrent',
      payloadParams: {
        optional: ['button']
      }
    }
  },
  '/session/:sessionId/buttondown': {
    POST: {}
  },
  '/session/:sessionId/buttonup': {
    POST: {}
  },
  '/session/:sessionId/doubleclick': {
    POST: {}
  },
  '/session/:sessionId/touch/click': {
    POST: {
      command: 'click',
      payloadParams: {
        required: ['element']
      }
    }
  },
  '/session/:sessionId/touch/down': {
    POST: {
      command: 'touchDown',
      payloadParams: {
        required: ['x', 'y']
      }
    }
  },
  '/session/:sessionId/touch/up': {
    POST: {
      command: 'touchUp',
      payloadParams: {
        required: ['x', 'y']
      }
    }
  },
  '/session/:sessionId/touch/move': {
    POST: {
      command: 'touchMove',
      payloadParams: {
        required: ['x', 'y']
      }
    }
  },
  '/session/:sessionId/touch/scroll': {
    POST: {}
  },
  '/session/:sessionId/touch/doubleclick': {
    POST: {}
  },
  '/session/:sessionId/actions': {
    POST: {
      command: 'performActions',
      payloadParams: {
        required: ['actions']
      }
    }
  },
  '/session/:sessionId/touch/longclick': {
    POST: {
      command: 'touchLongClick',
      payloadParams: {
        required: ['elements']
      }
    }
  },
  '/session/:sessionId/touch/flick': {
    POST: {
      command: 'flick',
      payloadParams: {
        optional: ['element', 'xspeed', 'yspeed', 'xoffset', 'yoffset', 'speed']
      }
    }
  },
  '/session/:sessionId/location': {
    GET: {
      command: 'getGeoLocation'
    },
    POST: {
      command: 'setGeoLocation',
      payloadParams: {
        required: ['location']
      }
    }
  },
  '/session/:sessionId/local_storage': {
    GET: {},
    POST: {},
    DELETE: {}
  },
  '/session/:sessionId/local_storage/key/:key': {
    GET: {},
    DELETE: {}
  },
  '/session/:sessionId/local_storage/size': {
    GET: {}
  },
  '/session/:sessionId/session_storage': {
    GET: {},
    POST: {},
    DELETE: {}
  },
  '/session/:sessionId/session_storage/key/:key': {
    GET: {},
    DELETE: {}
  },
  '/session/:sessionId/session_storage/size': {
    GET: {}
  },
  '/session/:sessionId/log': {
    POST: {
      command: 'getLog',
      payloadParams: {
        required: ['type']
      }
    }
  },
  '/session/:sessionId/log/types': {
    GET: {
      command: 'getLogTypes'
    }
  },
  '/session/:sessionId/application_cache/status': {
    GET: {}
  },
  '/session/:sessionId/context': {
    GET: {
      command: 'getCurrentContext'
    },
    POST: {
      command: 'setContext',
      payloadParams: {
        required: ['name']
      }
    }
  },
  '/session/:sessionId/contexts': {
    GET: {
      command: 'getContexts'
    }
  },
  '/session/:sessionId/element/:elementId/pageIndex': {
    GET: {
      command: 'getPageIndex'
    }
  },
  '/session/:sessionId/network_connection': {
    GET: {
      command: 'getNetworkConnection'
    },
    POST: {
      command: 'setNetworkConnection',
      payloadParams: {
        unwrap: 'parameters',
        required: ['type']
      }
    }
  },
  '/session/:sessionId/touch/perform': {
    POST: {
      command: 'performTouch',
      payloadParams: {
        wrap: 'actions',
        required: ['actions']
      }
    }
  },
  '/session/:sessionId/touch/multi/perform': {
    POST: {
      command: 'performMultiAction',
      payloadParams: {
        required: ['actions'],
        optional: ['elementId']
      }
    }
  },
  '/session/:sessionId/receive_async_response': {
    POST: {
      command: 'receiveAsyncResponse',
      payloadParams: {
        required: ['status', 'value']
      }
    }
  },
  '/session/:sessionId/appium/device/shake': {
    POST: {
      command: 'mobileShake'
    }
  },
  '/session/:sessionId/appium/device/system_time': {
    GET: {
      command: 'getDeviceTime',
      payloadParams: {
        optional: ['format']
      }
    },
    POST: {
      command: 'getDeviceTime',
      payloadParams: {
        optional: ['format']
      }
    }
  },
  '/session/:sessionId/appium/device/lock': {
    POST: {
      command: 'lock',
      payloadParams: {
        optional: ['seconds']
      }
    }
  },
  '/session/:sessionId/appium/device/unlock': {
    POST: {
      command: 'unlock'
    }
  },
  '/session/:sessionId/appium/device/is_locked': {
    POST: {
      command: 'isLocked'
    }
  },
  '/session/:sessionId/appium/start_recording_screen': {
    POST: {
      command: 'startRecordingScreen',
      payloadParams: {
        optional: ['options']
      }
    }
  },
  '/session/:sessionId/appium/stop_recording_screen': {
    POST: {
      command: 'stopRecordingScreen',
      payloadParams: {
        optional: ['options']
      }
    }
  },
  '/session/:sessionId/appium/performanceData/types': {
    POST: {
      command: 'getPerformanceDataTypes'
    }
  },
  '/session/:sessionId/appium/getPerformanceData': {
    POST: {
      command: 'getPerformanceData',
      payloadParams: {
        required: ['packageName', 'dataType'],
        optional: ['dataReadTimeout']
      }
    }
  },
  '/session/:sessionId/appium/device/press_keycode': {
    POST: {
      command: 'pressKeyCode',
      payloadParams: {
        required: ['keycode'],
        optional: ['metastate', 'flags']
      }
    }
  },
  '/session/:sessionId/appium/device/long_press_keycode': {
    POST: {
      command: 'longPressKeyCode',
      payloadParams: {
        required: ['keycode'],
        optional: ['metastate', 'flags']
      }
    }
  },
  '/session/:sessionId/appium/device/finger_print': {
    POST: {
      command: 'fingerprint',
      payloadParams: {
        required: ['fingerprintId']
      }
    }
  },
  '/session/:sessionId/appium/device/send_sms': {
    POST: {
      command: 'sendSMS',
      payloadParams: {
        required: ['phoneNumber', 'message']
      }
    }
  },
  '/session/:sessionId/appium/device/gsm_call': {
    POST: {
      command: 'gsmCall',
      payloadParams: {
        required: ['phoneNumber', 'action']
      }
    }
  },
  '/session/:sessionId/appium/device/gsm_signal': {
    POST: {
      command: 'gsmSignal',
      payloadParams: {
        validate: jsonObj => !_appiumSupport.util.hasValue(jsonObj.signalStrength) && !_appiumSupport.util.hasValue(jsonObj.signalStrengh) && 'we require one of "signalStrength" or "signalStrengh" params',
        optional: ['signalStrength', 'signalStrengh'],
        makeArgs: jsonObj => [_appiumSupport.util.hasValue(jsonObj.signalStrength) ? jsonObj.signalStrength : jsonObj.signalStrengh]
      }
    }
  },
  '/session/:sessionId/appium/device/gsm_voice': {
    POST: {
      command: 'gsmVoice',
      payloadParams: {
        required: ['state']
      }
    }
  },
  '/session/:sessionId/appium/device/power_capacity': {
    POST: {
      command: 'powerCapacity',
      payloadParams: {
        required: ['percent']
      }
    }
  },
  '/session/:sessionId/appium/device/power_ac': {
    POST: {
      command: 'powerAC',
      payloadParams: {
        required: ['state']
      }
    }
  },
  '/session/:sessionId/appium/device/network_speed': {
    POST: {
      command: 'networkSpeed',
      payloadParams: {
        required: ['netspeed']
      }
    }
  },
  '/session/:sessionId/appium/device/keyevent': {
    POST: {
      command: 'keyevent',
      payloadParams: {
        required: ['keycode'],
        optional: ['metastate']
      }
    }
  },
  '/session/:sessionId/appium/device/rotate': {
    POST: {
      command: 'mobileRotation',
      payloadParams: {
        required: ['x', 'y', 'radius', 'rotation', 'touchCount', 'duration'],
        optional: ['element']
      }
    }
  },
  '/session/:sessionId/appium/device/current_activity': {
    GET: {
      command: 'getCurrentActivity'
    }
  },
  '/session/:sessionId/appium/device/current_package': {
    GET: {
      command: 'getCurrentPackage'
    }
  },
  '/session/:sessionId/appium/device/install_app': {
    POST: {
      command: 'installApp',
      payloadParams: {
        required: ['appPath'],
        optional: ['options']
      }
    }
  },
  '/session/:sessionId/appium/device/activate_app': {
    POST: {
      command: 'activateApp',
      payloadParams: {
        required: [['appId'], ['bundleId']],
        optional: ['options']
      }
    }
  },
  '/session/:sessionId/appium/device/remove_app': {
    POST: {
      command: 'removeApp',
      payloadParams: {
        required: [['appId'], ['bundleId']],
        optional: ['options']
      }
    }
  },
  '/session/:sessionId/appium/device/terminate_app': {
    POST: {
      command: 'terminateApp',
      payloadParams: {
        required: [['appId'], ['bundleId']],
        optional: ['options']
      }
    }
  },
  '/session/:sessionId/appium/device/app_installed': {
    POST: {
      command: 'isAppInstalled',
      payloadParams: {
        required: [['appId'], ['bundleId']]
      }
    }
  },
  '/session/:sessionId/appium/device/app_state': {
    GET: {
      command: 'queryAppState',
      payloadParams: {
        required: [['appId'], ['bundleId']]
      }
    },
    POST: {
      command: 'queryAppState',
      payloadParams: {
        required: [['appId'], ['bundleId']]
      }
    }
  },
  '/session/:sessionId/appium/device/hide_keyboard': {
    POST: {
      command: 'hideKeyboard',
      payloadParams: {
        optional: ['strategy', 'key', 'keyCode', 'keyName']
      }
    }
  },
  '/session/:sessionId/appium/device/is_keyboard_shown': {
    GET: {
      command: 'isKeyboardShown'
    }
  },
  '/session/:sessionId/appium/device/push_file': {
    POST: {
      command: 'pushFile',
      payloadParams: {
        required: ['path', 'data']
      }
    }
  },
  '/session/:sessionId/appium/device/pull_file': {
    POST: {
      command: 'pullFile',
      payloadParams: {
        required: ['path']
      }
    }
  },
  '/session/:sessionId/appium/device/pull_folder': {
    POST: {
      command: 'pullFolder',
      payloadParams: {
        required: ['path']
      }
    }
  },
  '/session/:sessionId/appium/device/toggle_airplane_mode': {
    POST: {
      command: 'toggleFlightMode'
    }
  },
  '/session/:sessionId/appium/device/toggle_data': {
    POST: {
      command: 'toggleData'
    }
  },
  '/session/:sessionId/appium/device/toggle_wifi': {
    POST: {
      command: 'toggleWiFi'
    }
  },
  '/session/:sessionId/appium/device/toggle_location_services': {
    POST: {
      command: 'toggleLocationServices'
    }
  },
  '/session/:sessionId/appium/device/open_notifications': {
    POST: {
      command: 'openNotifications'
    }
  },
  '/session/:sessionId/appium/device/start_activity': {
    POST: {
      command: 'startActivity',
      payloadParams: {
        required: ['appPackage', 'appActivity'],
        optional: ['appWaitPackage', 'appWaitActivity', 'intentAction', 'intentCategory', 'intentFlags', 'optionalIntentArguments', 'dontStopAppOnReset']
      }
    }
  },
  '/session/:sessionId/appium/device/system_bars': {
    GET: {
      command: 'getSystemBars'
    }
  },
  '/session/:sessionId/appium/device/display_density': {
    GET: {
      command: 'getDisplayDensity'
    }
  },
  '/session/:sessionId/appium/simulator/touch_id': {
    POST: {
      command: 'touchId',
      payloadParams: {
        required: ['match']
      }
    }
  },
  '/session/:sessionId/appium/simulator/toggle_touch_id_enrollment': {
    POST: {
      command: 'toggleEnrollTouchId',
      payloadParams: {
        optional: ['enabled']
      }
    }
  },
  '/session/:sessionId/appium/app/launch': {
    POST: {
      command: 'launchApp'
    }
  },
  '/session/:sessionId/appium/app/close': {
    POST: {
      command: 'closeApp'
    }
  },
  '/session/:sessionId/appium/app/reset': {
    POST: {
      command: 'reset'
    }
  },
  '/session/:sessionId/appium/app/background': {
    POST: {
      command: 'background',
      payloadParams: {
        required: ['seconds']
      }
    }
  },
  '/session/:sessionId/appium/app/end_test_coverage': {
    POST: {
      command: 'endCoverage',
      payloadParams: {
        required: ['intent', 'path']
      }
    }
  },
  '/session/:sessionId/appium/app/strings': {
    POST: {
      command: 'getStrings',
      payloadParams: {
        optional: ['language', 'stringFile']
      }
    }
  },
  '/session/:sessionId/appium/element/:elementId/value': {
    POST: {
      command: 'setValueImmediate',
      payloadParams: {
        validate: jsonObj => !_appiumSupport.util.hasValue(jsonObj.value) && !_appiumSupport.util.hasValue(jsonObj.text) && 'we require one of "text" or "value" params',
        optional: ['value', 'text'],
        makeArgs: jsonObj => [jsonObj.value || jsonObj.text]
      }
    }
  },
  '/session/:sessionId/appium/element/:elementId/replace_value': {
    POST: {
      command: 'replaceValue',
      payloadParams: {
        validate: jsonObj => !_appiumSupport.util.hasValue(jsonObj.value) && !_appiumSupport.util.hasValue(jsonObj.text) && 'we require one of "text" or "value" params',
        optional: ['value', 'text'],
        makeArgs: jsonObj => [jsonObj.value || jsonObj.text]
      }
    }
  },
  '/session/:sessionId/appium/settings': {
    POST: {
      command: 'updateSettings',
      payloadParams: {
        required: ['settings']
      }
    },
    GET: {
      command: 'getSettings'
    }
  },
  '/session/:sessionId/appium/receive_async_response': {
    POST: {
      command: 'receiveAsyncResponse',
      payloadParams: {
        required: ['response']
      }
    }
  },
  '/session/:sessionId/appium/execute_driver': {
    POST: {
      command: 'executeDriverScript',
      payloadParams: {
        required: ['script'],
        optional: ['type', 'timeout']
      }
    }
  },
  '/session/:sessionId/alert_text': {
    GET: {
      command: 'getAlertText'
    },
    POST: {
      command: 'setAlertText',
      payloadParams: {
        required: ['text']
      }
    }
  },
  '/session/:sessionId/accept_alert': {
    POST: {
      command: 'postAcceptAlert'
    }
  },
  '/session/:sessionId/dismiss_alert': {
    POST: {
      command: 'postDismissAlert'
    }
  },
  '/session/:sessionId/alert/text': {
    GET: {
      command: 'getAlertText'
    },
    POST: {
      command: 'setAlertText',
      payloadParams: {
        validate: jsonObj => !_appiumSupport.util.hasValue(jsonObj.value) && !_appiumSupport.util.hasValue(jsonObj.text) && 'either "text" or "value" must be set',
        optional: ['value', 'text'],
        makeArgs: jsonObj => [jsonObj.value || jsonObj.text]
      }
    }
  },
  '/session/:sessionId/alert/accept': {
    POST: {
      command: 'postAcceptAlert'
    }
  },
  '/session/:sessionId/alert/dismiss': {
    POST: {
      command: 'postDismissAlert'
    }
  },
  '/session/:sessionId/element/:elementId/rect': {
    GET: {
      command: 'getElementRect'
    }
  },
  '/session/:sessionId/execute/sync': {
    POST: {
      command: 'execute',
      payloadParams: {
        required: ['script', 'args']
      }
    }
  },
  '/session/:sessionId/execute/async': {
    POST: {
      command: 'executeAsync',
      payloadParams: {
        required: ['script', 'args']
      }
    }
  },
  '/session/:sessionId/screenshot/:elementId': {
    GET: {
      command: 'getElementScreenshot'
    }
  },
  '/session/:sessionId/element/:elementId/screenshot': {
    GET: {
      command: 'getElementScreenshot'
    }
  },
  '/session/:sessionId/window/rect': {
    GET: {
      command: 'getWindowRect'
    },
    POST: {
      command: 'setWindowRect'
    }
  },
  '/session/:sessionId/window/maximize': {
    POST: {
      command: 'maximizeWindow'
    }
  },
  '/session/:sessionId/window/minimize': {
    POST: {
      command: 'minimizeWindow'
    }
  },
  '/session/:sessionId/window/fullscreen': {
    POST: {
      command: 'fullScreenWindow'
    }
  },
  '/session/:sessionId/element/:elementId/property/:name': {
    GET: {
      command: 'getProperty'
    }
  },
  '/session/:sessionId/appium/device/set_clipboard': {
    POST: {
      command: 'setClipboard',
      payloadParams: {
        required: ['content'],
        optional: ['contentType', 'label']
      }
    }
  },
  '/session/:sessionId/appium/device/get_clipboard': {
    POST: {
      command: 'getClipboard',
      payloadParams: {
        optional: ['contentType']
      }
    }
  },
  '/session/:sessionId/appium/compare_images': {
    POST: {
      command: 'compareImages',
      payloadParams: {
        required: ['mode', 'firstImage', 'secondImage'],
        optional: ['options']
      }
    }
  }
};
exports.METHOD_MAP = METHOD_MAP;
let ALL_COMMANDS = [];
exports.ALL_COMMANDS = ALL_COMMANDS;

for (let v of _lodash.default.values(METHOD_MAP)) {
  for (let m of _lodash.default.values(v)) {
    if (m.command) {
      ALL_COMMANDS.push(m.command);
    }
  }
}

const RE_ESCAPE = /[-[\]{}()+?.,\\^$|#\s]/g;
const RE_PARAM = /([:*])(\w+)/g;

class Route {
  constructor(route) {
    this.paramNames = [];
    let reStr = route.replace(RE_ESCAPE, '\\$&');
    reStr = reStr.replace(RE_PARAM, (_, mode, name) => {
      this.paramNames.push(name);
      return mode === ':' ? '([^/]*)' : '(.*)';
    });
    this.routeRegexp = new RegExp(`^${reStr}$`);
  }

  parse(url) {
    let matches = url.match(this.routeRegexp);
    if (!matches) return;
    let i = 0;
    let params = {};

    while (i < this.paramNames.length) {
      const paramName = this.paramNames[i++];
      params[paramName] = matches[i];
    }

    return params;
  }

}

function routeToCommandName(endpoint, method, basePath = _protocol.DEFAULT_BASE_PATH) {
  let dstRoute = null;

  if (endpoint.includes('?')) {
    endpoint = endpoint.slice(0, endpoint.indexOf('?'));
  }

  const actualEndpoint = endpoint === '/' ? '' : _lodash.default.startsWith(endpoint, '/') ? endpoint : `/${endpoint}`;

  for (let currentRoute of _lodash.default.keys(METHOD_MAP)) {
    const route = new Route(`${basePath}${currentRoute}`);

    if (route.parse(`${basePath}/session/ignored-session-id${actualEndpoint}`) || route.parse(`${basePath}${actualEndpoint}`) || route.parse(actualEndpoint)) {
      dstRoute = currentRoute;
      break;
    }
  }

  if (!dstRoute) return;

  const methods = _lodash.default.get(METHOD_MAP, dstRoute);

  method = _lodash.default.toUpper(method);

  if (_lodash.default.has(methods, method)) {
    const dstMethod = _lodash.default.get(methods, method);

    if (dstMethod.command) {
      return dstMethod.command;
    }
  }
}

const NO_SESSION_ID_COMMANDS = ['createSession', 'getStatus', 'getSessions'];
exports.NO_SESSION_ID_COMMANDS = NO_SESSION_ID_COMMANDS;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9wcm90b2NvbC9yb3V0ZXMuanMiXSwibmFtZXMiOlsiTUVUSE9EX01BUCIsIkdFVCIsImNvbW1hbmQiLCJQT1NUIiwicGF5bG9hZFBhcmFtcyIsInZhbGlkYXRlIiwianNvbk9iaiIsImNhcGFiaWxpdGllcyIsImRlc2lyZWRDYXBhYmlsaXRpZXMiLCJvcHRpb25hbCIsIkRFTEVURSIsInByb3RvY29sTmFtZSIsIlBST1RPQ09MUyIsIlczQyIsInV0aWwiLCJoYXNWYWx1ZSIsInNjcmlwdCIsInBhZ2VMb2FkIiwiaW1wbGljaXQiLCJ0eXBlIiwibXMiLCJyZXF1aXJlZCIsIm1ha2VBcmdzIiwiaGFuZGxlIiwibmFtZSIsInZhbHVlIiwidGV4dCIsInVud3JhcCIsIndyYXAiLCJzaWduYWxTdHJlbmd0aCIsInNpZ25hbFN0cmVuZ2giLCJBTExfQ09NTUFORFMiLCJ2IiwiXyIsInZhbHVlcyIsIm0iLCJwdXNoIiwiUkVfRVNDQVBFIiwiUkVfUEFSQU0iLCJSb3V0ZSIsImNvbnN0cnVjdG9yIiwicm91dGUiLCJwYXJhbU5hbWVzIiwicmVTdHIiLCJyZXBsYWNlIiwibW9kZSIsInJvdXRlUmVnZXhwIiwiUmVnRXhwIiwicGFyc2UiLCJ1cmwiLCJtYXRjaGVzIiwibWF0Y2giLCJpIiwicGFyYW1zIiwibGVuZ3RoIiwicGFyYW1OYW1lIiwicm91dGVUb0NvbW1hbmROYW1lIiwiZW5kcG9pbnQiLCJtZXRob2QiLCJiYXNlUGF0aCIsIkRFRkFVTFRfQkFTRV9QQVRIIiwiZHN0Um91dGUiLCJpbmNsdWRlcyIsInNsaWNlIiwiaW5kZXhPZiIsImFjdHVhbEVuZHBvaW50Iiwic3RhcnRzV2l0aCIsImN1cnJlbnRSb3V0ZSIsImtleXMiLCJtZXRob2RzIiwiZ2V0IiwidG9VcHBlciIsImhhcyIsImRzdE1ldGhvZCIsIk5PX1NFU1NJT05fSURfQ09NTUFORFMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQU1BLE1BQU1BLFVBQVUs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UUFBUyxFQUR6RDs7QUFHQSxPQUFLLElBQUlVLFlBQVQsSUFBeUJsQyxnQkFBRW1DLElBQUYsQ0FBT3BFLFVBQVAsQ0FBekIsRUFBNkM7QUFDM0MsVUFBTXlDLEtBQUssR0FBRyxJQUFJRixLQUFKLENBQVcsR0FBRW9CLFFBQVMsR0FBRVEsWUFBYSxFQUFyQyxDQUFkOztBQUVBLFFBQUkxQixLQUFLLENBQUNPLEtBQU4sQ0FBYSxHQUFFVyxRQUFTLDhCQUE2Qk0sY0FBZSxFQUFwRSxLQUNBeEIsS0FBSyxDQUFDTyxLQUFOLENBQWEsR0FBRVcsUUFBUyxHQUFFTSxjQUFlLEVBQXpDLENBREEsSUFDK0N4QixLQUFLLENBQUNPLEtBQU4sQ0FBWWlCLGNBQVosQ0FEbkQsRUFDZ0Y7QUFDOUVKLE1BQUFBLFFBQVEsR0FBR00sWUFBWDtBQUNBO0FBQ0Q7QUFDRjs7QUFDRCxNQUFJLENBQUNOLFFBQUwsRUFBZTs7QUFFZixRQUFNUSxPQUFPLEdBQUdwQyxnQkFBRXFDLEdBQUYsQ0FBTXRFLFVBQU4sRUFBa0I2RCxRQUFsQixDQUFoQjs7QUFDQUgsRUFBQUEsTUFBTSxHQUFHekIsZ0JBQUVzQyxPQUFGLENBQVViLE1BQVYsQ0FBVDs7QUFDQSxNQUFJekIsZ0JBQUV1QyxHQUFGLENBQU1ILE9BQU4sRUFBZVgsTUFBZixDQUFKLEVBQTRCO0FBQzFCLFVBQU1lLFNBQVMsR0FBR3hDLGdCQUFFcUMsR0FBRixDQUFNRCxPQUFOLEVBQWVYLE1BQWYsQ0FBbEI7O0FBQ0EsUUFBSWUsU0FBUyxDQUFDdkUsT0FBZCxFQUF1QjtBQUNyQixhQUFPdUUsU0FBUyxDQUFDdkUsT0FBakI7QUFDRDtBQUNGO0FBQ0Y7O0FBR0QsTUFBTXdFLHNCQUFzQixHQUFHLENBQUMsZUFBRCxFQUFrQixXQUFsQixFQUErQixhQUEvQixDQUEvQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB1dGlsIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IHsgREVGQVVMVF9CQVNFX1BBVEgsIFBST1RPQ09MUyB9IGZyb20gJy4vcHJvdG9jb2wnO1xuXG5cbi8vIGRlZmluZSB0aGUgcm91dGVzLCBtYXBwaW5nIG9mIEhUVFAgbWV0aG9kcyB0byBwYXJ0aWN1bGFyIGRyaXZlciBjb21tYW5kcyxcbi8vIGFuZCBhbnkgcGFyYW1ldGVycyB0aGF0IGFyZSBleHBlY3RlZCBpbiBhIHJlcXVlc3Rcbi8vIHBhcmFtZXRlcnMgY2FuIGJlIGByZXF1aXJlZGAgb3IgYG9wdGlvbmFsYFxuY29uc3QgTUVUSE9EX01BUCA9IHtcbiAgJy9zdGF0dXMnOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldFN0YXR1cyd9XG4gIH0sXG4gICcvc2Vzc2lvbic6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2NyZWF0ZVNlc3Npb24nLCBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICB2YWxpZGF0ZTogKGpzb25PYmopID0+ICghanNvbk9iai5jYXBhYmlsaXRpZXMgJiYgIWpzb25PYmouZGVzaXJlZENhcGFiaWxpdGllcykgJiYgJ3dlIHJlcXVpcmUgb25lIG9mIFwiZGVzaXJlZENhcGFiaWxpdGllc1wiIG9yIFwiY2FwYWJpbGl0aWVzXCIgb2JqZWN0JyxcbiAgICAgIG9wdGlvbmFsOiBbJ2Rlc2lyZWRDYXBhYmlsaXRpZXMnLCAncmVxdWlyZWRDYXBhYmlsaXRpZXMnLCAnY2FwYWJpbGl0aWVzJ119fVxuICB9LFxuICAnL3Nlc3Npb25zJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRTZXNzaW9ucyd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRTZXNzaW9uJ30sXG4gICAgREVMRVRFOiB7Y29tbWFuZDogJ2RlbGV0ZVNlc3Npb24nfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC90aW1lb3V0cyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0VGltZW91dHMnfSwgLy8gVzNDIHJvdXRlXG4gICAgUE9TVDoge2NvbW1hbmQ6ICd0aW1lb3V0cycsIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgIHZhbGlkYXRlOiAoanNvbk9iaiwgcHJvdG9jb2xOYW1lKSA9PiB7XG4gICAgICAgIGlmIChwcm90b2NvbE5hbWUgPT09IFBST1RPQ09MUy5XM0MpIHtcbiAgICAgICAgICBpZiAoIXV0aWwuaGFzVmFsdWUoanNvbk9iai5zY3JpcHQpICYmICF1dGlsLmhhc1ZhbHVlKGpzb25PYmoucGFnZUxvYWQpICYmICF1dGlsLmhhc1ZhbHVlKGpzb25PYmouaW1wbGljaXQpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1czQyBwcm90b2NvbCBleHBlY3RzIGFueSBvZiBzY3JpcHQsIHBhZ2VMb2FkIG9yIGltcGxpY2l0IHRvIGJlIHNldCc7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICghdXRpbC5oYXNWYWx1ZShqc29uT2JqLnR5cGUpIHx8ICF1dGlsLmhhc1ZhbHVlKGpzb25PYmoubXMpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ01KU09OV1AgcHJvdG9jb2wgcmVxdWlyZXMgdHlwZSBhbmQgbXMnO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIG9wdGlvbmFsOiBbJ3R5cGUnLCAnbXMnLCAnc2NyaXB0JywgJ3BhZ2VMb2FkJywgJ2ltcGxpY2l0J10sXG4gICAgfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvdGltZW91dHMvYXN5bmNfc2NyaXB0Jzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnYXN5bmNTY3JpcHRUaW1lb3V0JywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ21zJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC90aW1lb3V0cy9pbXBsaWNpdF93YWl0Jzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnaW1wbGljaXRXYWl0JywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ21zJ119fVxuICB9LFxuICAvLyBKU09OV1BcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvd2luZG93X2hhbmRsZSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0V2luZG93SGFuZGxlJ31cbiAgfSxcbiAgLy8gVzNDXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3dpbmRvdy9oYW5kbGUnOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldFdpbmRvd0hhbmRsZSd9XG4gIH0sXG4gIC8vIEpTT05XUFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC93aW5kb3dfaGFuZGxlcyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0V2luZG93SGFuZGxlcyd9XG4gIH0sXG4gIC8vIFczQ1xuICAnL3Nlc3Npb24vOnNlc3Npb25JZC93aW5kb3cvaGFuZGxlcyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0V2luZG93SGFuZGxlcyd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3VybCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0VXJsJ30sXG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZXRVcmwnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsndXJsJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9mb3J3YXJkJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZm9yd2FyZCd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2JhY2snOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdiYWNrJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvcmVmcmVzaCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3JlZnJlc2gnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9leGVjdXRlJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZXhlY3V0ZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzY3JpcHQnLCAnYXJncyddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZXhlY3V0ZV9hc3luYyc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2V4ZWN1dGVBc3luYycsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzY3JpcHQnLCAnYXJncyddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvc2NyZWVuc2hvdCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0U2NyZWVuc2hvdCd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2ltZS9hdmFpbGFibGVfZW5naW5lcyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnYXZhaWxhYmxlSU1FRW5naW5lcyd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2ltZS9hY3RpdmVfZW5naW5lJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRBY3RpdmVJTUVFbmdpbmUnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9pbWUvYWN0aXZhdGVkJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdpc0lNRUFjdGl2YXRlZCd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2ltZS9kZWFjdGl2YXRlJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZGVhY3RpdmF0ZUlNRUVuZ2luZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2ltZS9hY3RpdmF0ZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2FjdGl2YXRlSU1FRW5naW5lJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ2VuZ2luZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZnJhbWUnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZXRGcmFtZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydpZCddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZnJhbWUvcGFyZW50Jzoge1xuICAgIFBPU1Q6IHt9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3dpbmRvdyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0V2luZG93SGFuZGxlJ30sXG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZXRXaW5kb3cnLCBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICBvcHRpb25hbDogWyduYW1lJywgJ2hhbmRsZSddLFxuICAgICAgLy8gUmV0dXJuIGJvdGggdmFsdWVzIHRvIG1hdGNoIFczQyBhbmQgSlNPTldQIHByb3RvY29sc1xuICAgICAgbWFrZUFyZ3M6IChqc29uT2JqKSA9PiB7XG4gICAgICAgIGlmICh1dGlsLmhhc1ZhbHVlKGpzb25PYmouaGFuZGxlKSAmJiAhdXRpbC5oYXNWYWx1ZShqc29uT2JqLm5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIFtqc29uT2JqLmhhbmRsZSwganNvbk9iai5oYW5kbGVdO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1dGlsLmhhc1ZhbHVlKGpzb25PYmoubmFtZSkgJiYgIXV0aWwuaGFzVmFsdWUoanNvbk9iai5oYW5kbGUpKSB7XG4gICAgICAgICAgcmV0dXJuIFtqc29uT2JqLm5hbWUsIGpzb25PYmoubmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtqc29uT2JqLm5hbWUsIGpzb25PYmouaGFuZGxlXTtcbiAgICAgIH0sXG4gICAgICB2YWxpZGF0ZTogKGpzb25PYmopID0+ICghdXRpbC5oYXNWYWx1ZShqc29uT2JqLm5hbWUpICYmICF1dGlsLmhhc1ZhbHVlKGpzb25PYmouaGFuZGxlKSlcbiAgICAgICAgJiYgJ3dlIHJlcXVpcmUgb25lIG9mIFwibmFtZVwiIG9yIFwiaGFuZGxlXCIgdG8gYmUgc2V0JyxcbiAgICB9fSxcbiAgICBERUxFVEU6IHtjb21tYW5kOiAnY2xvc2VXaW5kb3cnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC93aW5kb3cvOndpbmRvd2hhbmRsZS9zaXplJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRXaW5kb3dTaXplJ30sXG4gICAgUE9TVDoge31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvd2luZG93Lzp3aW5kb3doYW5kbGUvcG9zaXRpb24nOiB7XG4gICAgUE9TVDoge30sXG4gICAgR0VUOiB7fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC93aW5kb3cvOndpbmRvd2hhbmRsZS9tYXhpbWl6ZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ21heGltaXplV2luZG93J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvY29va2llJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRDb29raWVzJ30sXG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZXRDb29raWUnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnY29va2llJ119fSxcbiAgICBERUxFVEU6IHtjb21tYW5kOiAnZGVsZXRlQ29va2llcyd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2Nvb2tpZS86bmFtZSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0Q29va2llJ30sXG4gICAgREVMRVRFOiB7Y29tbWFuZDogJ2RlbGV0ZUNvb2tpZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3NvdXJjZSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0UGFnZVNvdXJjZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3RpdGxlJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICd0aXRsZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2VsZW1lbnQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdmaW5kRWxlbWVudCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWyd1c2luZycsICd2YWx1ZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudHMnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdmaW5kRWxlbWVudHMnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsndXNpbmcnLCAndmFsdWUnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2VsZW1lbnQvYWN0aXZlJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdhY3RpdmUnfSwgLy8gVzNDOiBodHRwczovL3czYy5naXRodWIuaW8vd2ViZHJpdmVyL3dlYmRyaXZlci1zcGVjLmh0bWwjZGZuLWdldC1hY3RpdmUtZWxlbWVudFxuICAgIFBPU1Q6IHtjb21tYW5kOiAnYWN0aXZlJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkJzoge1xuICAgIEdFVDoge31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL2VsZW1lbnQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdmaW5kRWxlbWVudEZyb21FbGVtZW50JywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3VzaW5nJywgJ3ZhbHVlJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvZWxlbWVudHMnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdmaW5kRWxlbWVudHNGcm9tRWxlbWVudCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWyd1c2luZycsICd2YWx1ZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL2NsaWNrJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnY2xpY2snfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvc3VibWl0Jzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnc3VibWl0J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL3RleHQnOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldFRleHQnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvdmFsdWUnOiB7XG4gICAgUE9TVDoge1xuICAgICAgY29tbWFuZDogJ3NldFZhbHVlJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgdmFsaWRhdGU6IChqc29uT2JqKSA9PiAoIXV0aWwuaGFzVmFsdWUoanNvbk9iai52YWx1ZSkgJiYgIXV0aWwuaGFzVmFsdWUoanNvbk9iai50ZXh0KSkgJiZcbiAgICAgICAgICAgICd3ZSByZXF1aXJlIG9uZSBvZiBcInRleHRcIiBvciBcInZhbHVlXCIgcGFyYW1zJyxcbiAgICAgICAgb3B0aW9uYWw6IFsndmFsdWUnLCAndGV4dCddLFxuICAgICAgICAvLyBvdmVycmlkZSB0aGUgZGVmYXVsdCBhcmd1bWVudCBjb25zdHJ1Y3RvciBiZWNhdXNlIG9mIHRoZSBzcGVjaWFsXG4gICAgICAgIC8vIGxvZ2ljIGhlcmUuIEJhc2ljYWxseSB3ZSB3YW50IHRvIGFjY2VwdCBlaXRoZXIgYSB2YWx1ZSAob2xkIEpTT05XUClcbiAgICAgICAgLy8gb3IgYSB0ZXh0IChuZXcgVzNDKSBwYXJhbWV0ZXIsIGJ1dCBvbmx5IHNlbmQgb25lIG9mIHRoZW0gdG8gdGhlXG4gICAgICAgIC8vIGNvbW1hbmQgKG5vdCBib3RoKS4gUHJlZmVyICd2YWx1ZScgc2luY2UgaXQncyBtb3JlXG4gICAgICAgIC8vIGJhY2t3YXJkLWNvbXBhdGlibGUuXG4gICAgICAgIG1ha2VBcmdzOiAoanNvbk9iaikgPT4gW2pzb25PYmoudmFsdWUgfHwganNvbk9iai50ZXh0XSxcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2tleXMnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdrZXlzJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3ZhbHVlJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvbmFtZSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0TmFtZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2VsZW1lbnQvOmVsZW1lbnRJZC9jbGVhcic6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2NsZWFyJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL3NlbGVjdGVkJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdlbGVtZW50U2VsZWN0ZWQnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvZW5hYmxlZCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZWxlbWVudEVuYWJsZWQnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvYXR0cmlidXRlLzpuYW1lJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRBdHRyaWJ1dGUnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvZXF1YWxzLzpvdGhlcklkJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdlcXVhbHNFbGVtZW50J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL2Rpc3BsYXllZCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZWxlbWVudERpc3BsYXllZCd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2VsZW1lbnQvOmVsZW1lbnRJZC9sb2NhdGlvbic6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0TG9jYXRpb24nfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvbG9jYXRpb25faW5fdmlldyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0TG9jYXRpb25JblZpZXcnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvc2l6ZSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0U2l6ZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2VsZW1lbnQvOmVsZW1lbnRJZC9jc3MvOnByb3BlcnR5TmFtZSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0Q3NzUHJvcGVydHknfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9vcmllbnRhdGlvbic6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0T3JpZW50YXRpb24nfSxcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3NldE9yaWVudGF0aW9uJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ29yaWVudGF0aW9uJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9yb3RhdGlvbic6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0Um90YXRpb24nfSxcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3NldFJvdGF0aW9uJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3gnLCAneScsICd6J119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9tb3ZldG8nOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdtb3ZlVG8nLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnZWxlbWVudCcsICd4b2Zmc2V0JywgJ3lvZmZzZXQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2NsaWNrJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnY2xpY2tDdXJyZW50JywgcGF5bG9hZFBhcmFtczoge29wdGlvbmFsOiBbJ2J1dHRvbiddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYnV0dG9uZG93bic6IHtcbiAgICBQT1NUOiB7fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9idXR0b251cCc6IHtcbiAgICBQT1NUOiB7fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9kb3VibGVjbGljayc6IHtcbiAgICBQT1NUOiB7fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC90b3VjaC9jbGljayc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2NsaWNrJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ2VsZW1lbnQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3RvdWNoL2Rvd24nOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICd0b3VjaERvd24nLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsneCcsICd5J119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC90b3VjaC91cCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3RvdWNoVXAnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsneCcsICd5J119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC90b3VjaC9tb3ZlJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAndG91Y2hNb3ZlJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3gnLCAneSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvdG91Y2gvc2Nyb2xsJzoge1xuICAgIFBPU1Q6IHt9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3RvdWNoL2RvdWJsZWNsaWNrJzoge1xuICAgIFBPU1Q6IHt9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FjdGlvbnMnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwZXJmb3JtQWN0aW9ucycsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydhY3Rpb25zJ119fSxcbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvdG91Y2gvbG9uZ2NsaWNrJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAndG91Y2hMb25nQ2xpY2snLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnZWxlbWVudHMnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3RvdWNoL2ZsaWNrJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZmxpY2snLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnZWxlbWVudCcsICd4c3BlZWQnLCAneXNwZWVkJywgJ3hvZmZzZXQnLCAneW9mZnNldCcsICdzcGVlZCddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvbG9jYXRpb24nOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldEdlb0xvY2F0aW9uJ30sXG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZXRHZW9Mb2NhdGlvbicsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydsb2NhdGlvbiddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvbG9jYWxfc3RvcmFnZSc6IHtcbiAgICBHRVQ6IHt9LFxuICAgIFBPU1Q6IHt9LFxuICAgIERFTEVURToge31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvbG9jYWxfc3RvcmFnZS9rZXkvOmtleSc6IHtcbiAgICBHRVQ6IHt9LFxuICAgIERFTEVURToge31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvbG9jYWxfc3RvcmFnZS9zaXplJzoge1xuICAgIEdFVDoge31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvc2Vzc2lvbl9zdG9yYWdlJzoge1xuICAgIEdFVDoge30sXG4gICAgUE9TVDoge30sXG4gICAgREVMRVRFOiB7fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9zZXNzaW9uX3N0b3JhZ2Uva2V5LzprZXknOiB7XG4gICAgR0VUOiB7fSxcbiAgICBERUxFVEU6IHt9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3Nlc3Npb25fc3RvcmFnZS9zaXplJzoge1xuICAgIEdFVDoge31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvbG9nJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZ2V0TG9nJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3R5cGUnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2xvZy90eXBlcyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0TG9nVHlwZXMnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBsaWNhdGlvbl9jYWNoZS9zdGF0dXMnOiB7XG4gICAgR0VUOiB7fVxuICB9LFxuXG4gIC8vXG4gIC8vIG1qc29ud2lyZVxuICAvL1xuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9jb250ZXh0Jzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRDdXJyZW50Q29udGV4dCd9LFxuICAgIFBPU1Q6IHtjb21tYW5kOiAnc2V0Q29udGV4dCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWyduYW1lJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9jb250ZXh0cyc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0Q29udGV4dHMnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvcGFnZUluZGV4Jzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRQYWdlSW5kZXgnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9uZXR3b3JrX2Nvbm5lY3Rpb24nOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldE5ldHdvcmtDb25uZWN0aW9uJ30sXG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZXROZXR3b3JrQ29ubmVjdGlvbicsIHBheWxvYWRQYXJhbXM6IHt1bndyYXA6ICdwYXJhbWV0ZXJzJywgcmVxdWlyZWQ6IFsndHlwZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvdG91Y2gvcGVyZm9ybSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3BlcmZvcm1Ub3VjaCcsIHBheWxvYWRQYXJhbXM6IHt3cmFwOiAnYWN0aW9ucycsIHJlcXVpcmVkOiBbJ2FjdGlvbnMnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3RvdWNoL211bHRpL3BlcmZvcm0nOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwZXJmb3JtTXVsdGlBY3Rpb24nLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnYWN0aW9ucyddLCBvcHRpb25hbDogWydlbGVtZW50SWQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3JlY2VpdmVfYXN5bmNfcmVzcG9uc2UnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdyZWNlaXZlQXN5bmNSZXNwb25zZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzdGF0dXMnLCAndmFsdWUnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2Uvc2hha2UnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdtb2JpbGVTaGFrZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2Uvc3lzdGVtX3RpbWUnOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldERldmljZVRpbWUnLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnZm9ybWF0J119fSxcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2dldERldmljZVRpbWUnLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnZm9ybWF0J119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL2xvY2snOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdsb2NrJywgcGF5bG9hZFBhcmFtczoge29wdGlvbmFsOiBbJ3NlY29uZHMnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvdW5sb2NrJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAndW5sb2NrJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9pc19sb2NrZWQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdpc0xvY2tlZCd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9zdGFydF9yZWNvcmRpbmdfc2NyZWVuJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnc3RhcnRSZWNvcmRpbmdTY3JlZW4nLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnb3B0aW9ucyddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL3N0b3BfcmVjb3JkaW5nX3NjcmVlbic6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3N0b3BSZWNvcmRpbmdTY3JlZW4nLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnb3B0aW9ucyddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL3BlcmZvcm1hbmNlRGF0YS90eXBlcyc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2dldFBlcmZvcm1hbmNlRGF0YVR5cGVzJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2dldFBlcmZvcm1hbmNlRGF0YSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2dldFBlcmZvcm1hbmNlRGF0YScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydwYWNrYWdlTmFtZScsICdkYXRhVHlwZSddLCBvcHRpb25hbDogWydkYXRhUmVhZFRpbWVvdXQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvcHJlc3Nfa2V5Y29kZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3ByZXNzS2V5Q29kZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydrZXljb2RlJ10sIG9wdGlvbmFsOiBbJ21ldGFzdGF0ZScsICdmbGFncyddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9sb25nX3ByZXNzX2tleWNvZGUnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdsb25nUHJlc3NLZXlDb2RlJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ2tleWNvZGUnXSwgb3B0aW9uYWw6IFsnbWV0YXN0YXRlJywgJ2ZsYWdzJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL2Zpbmdlcl9wcmludCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2ZpbmdlcnByaW50JywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ2ZpbmdlcnByaW50SWQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2Uvc2VuZF9zbXMnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdzZW5kU01TJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3Bob25lTnVtYmVyJywgJ21lc3NhZ2UnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvZ3NtX2NhbGwnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdnc21DYWxsJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3Bob25lTnVtYmVyJywgJ2FjdGlvbiddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9nc21fc2lnbmFsJzoge1xuICAgIFBPU1Q6IHtcbiAgICAgIGNvbW1hbmQ6ICdnc21TaWduYWwnLFxuICAgICAgcGF5bG9hZFBhcmFtczoge1xuICAgICAgICB2YWxpZGF0ZTogKGpzb25PYmopID0+ICghdXRpbC5oYXNWYWx1ZShqc29uT2JqLnNpZ25hbFN0cmVuZ3RoKSAmJiAhdXRpbC5oYXNWYWx1ZShqc29uT2JqLnNpZ25hbFN0cmVuZ2gpKSAmJlxuICAgICAgICAgICAgJ3dlIHJlcXVpcmUgb25lIG9mIFwic2lnbmFsU3RyZW5ndGhcIiBvciBcInNpZ25hbFN0cmVuZ2hcIiBwYXJhbXMnLFxuICAgICAgICBvcHRpb25hbDogWydzaWduYWxTdHJlbmd0aCcsICdzaWduYWxTdHJlbmdoJ10sXG4gICAgICAgIC8vIGJhY2t3YXJkLWNvbXBhdGlibGUuIHNvbk9iai5zaWduYWxTdHJlbmd0aCBjYW4gYmUgMFxuICAgICAgICBtYWtlQXJnczogKGpzb25PYmopID0+IFt1dGlsLmhhc1ZhbHVlKGpzb25PYmouc2lnbmFsU3RyZW5ndGgpID8ganNvbk9iai5zaWduYWxTdHJlbmd0aCA6IGpzb25PYmouc2lnbmFsU3RyZW5naF1cbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvZ3NtX3ZvaWNlJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZ3NtVm9pY2UnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnc3RhdGUnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvcG93ZXJfY2FwYWNpdHknOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwb3dlckNhcGFjaXR5JywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3BlcmNlbnQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvcG93ZXJfYWMnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwb3dlckFDJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3N0YXRlJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL25ldHdvcmtfc3BlZWQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICduZXR3b3JrU3BlZWQnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnbmV0c3BlZWQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2Uva2V5ZXZlbnQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdrZXlldmVudCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydrZXljb2RlJ10sIG9wdGlvbmFsOiBbJ21ldGFzdGF0ZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9yb3RhdGUnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdtb2JpbGVSb3RhdGlvbicsIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgIHJlcXVpcmVkOiBbJ3gnLCAneScsICdyYWRpdXMnLCAncm90YXRpb24nLCAndG91Y2hDb3VudCcsICdkdXJhdGlvbiddLFxuICAgICAgb3B0aW9uYWw6IFsnZWxlbWVudCddIH19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvY3VycmVudF9hY3Rpdml0eSc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0Q3VycmVudEFjdGl2aXR5J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9jdXJyZW50X3BhY2thZ2UnOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldEN1cnJlbnRQYWNrYWdlJ31cbiAgfSxcbiAgLy9yZWdpb24gQXBwbGljYXRpb25zIE1hbmFnZW1lbnRcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9pbnN0YWxsX2FwcCc6IHtcbiAgICBQT1NUOiB7XG4gICAgICBjb21tYW5kOiAnaW5zdGFsbEFwcCcsXG4gICAgICBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICAgIHJlcXVpcmVkOiBbJ2FwcFBhdGgnXSxcbiAgICAgICAgb3B0aW9uYWw6IFsnb3B0aW9ucyddXG4gICAgICB9XG4gICAgfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL2FjdGl2YXRlX2FwcCc6IHtcbiAgICBQT1NUOiB7XG4gICAgICBjb21tYW5kOiAnYWN0aXZhdGVBcHAnLFxuICAgICAgcGF5bG9hZFBhcmFtczoge1xuICAgICAgICByZXF1aXJlZDogW1snYXBwSWQnXSwgWydidW5kbGVJZCddXSxcbiAgICAgICAgb3B0aW9uYWw6IFsnb3B0aW9ucyddXG4gICAgICB9XG4gICAgfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL3JlbW92ZV9hcHAnOiB7XG4gICAgUE9TVDoge1xuICAgICAgY29tbWFuZDogJ3JlbW92ZUFwcCcsXG4gICAgICBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICAgIHJlcXVpcmVkOiBbWydhcHBJZCddLCBbJ2J1bmRsZUlkJ11dLFxuICAgICAgICBvcHRpb25hbDogWydvcHRpb25zJ11cbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvdGVybWluYXRlX2FwcCc6IHtcbiAgICBQT1NUOiB7XG4gICAgICBjb21tYW5kOiAndGVybWluYXRlQXBwJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgcmVxdWlyZWQ6IFtbJ2FwcElkJ10sIFsnYnVuZGxlSWQnXV0sXG4gICAgICAgIG9wdGlvbmFsOiBbJ29wdGlvbnMnXVxuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9hcHBfaW5zdGFsbGVkJzoge1xuICAgIFBPU1Q6IHtcbiAgICAgIGNvbW1hbmQ6ICdpc0FwcEluc3RhbGxlZCcsXG4gICAgICBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICAgIHJlcXVpcmVkOiBbWydhcHBJZCddLCBbJ2J1bmRsZUlkJ11dXG4gICAgICB9XG4gICAgfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL2FwcF9zdGF0ZSc6IHtcbiAgICBHRVQ6IHtcbiAgICAgIGNvbW1hbmQ6ICdxdWVyeUFwcFN0YXRlJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgcmVxdWlyZWQ6IFtbJ2FwcElkJ10sIFsnYnVuZGxlSWQnXV1cbiAgICAgIH1cbiAgICB9LFxuICAgIFBPU1Q6IHtcbiAgICAgIGNvbW1hbmQ6ICdxdWVyeUFwcFN0YXRlJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgcmVxdWlyZWQ6IFtbJ2FwcElkJ10sIFsnYnVuZGxlSWQnXV1cbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gIC8vZW5kcmVnaW9uXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvaGlkZV9rZXlib2FyZCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2hpZGVLZXlib2FyZCcsIHBheWxvYWRQYXJhbXM6IHtvcHRpb25hbDogWydzdHJhdGVneScsICdrZXknLCAna2V5Q29kZScsICdrZXlOYW1lJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL2lzX2tleWJvYXJkX3Nob3duJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdpc0tleWJvYXJkU2hvd24nfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL3B1c2hfZmlsZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3B1c2hGaWxlJywgcGF5bG9hZFBhcmFtczoge3JlcXVpcmVkOiBbJ3BhdGgnLCAnZGF0YSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9wdWxsX2ZpbGUnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwdWxsRmlsZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydwYXRoJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL3B1bGxfZm9sZGVyJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAncHVsbEZvbGRlcicsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydwYXRoJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL3RvZ2dsZV9haXJwbGFuZV9tb2RlJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAndG9nZ2xlRmxpZ2h0TW9kZSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvdG9nZ2xlX2RhdGEnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICd0b2dnbGVEYXRhJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS90b2dnbGVfd2lmaSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3RvZ2dsZVdpRmknfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL3RvZ2dsZV9sb2NhdGlvbl9zZXJ2aWNlcyc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3RvZ2dsZUxvY2F0aW9uU2VydmljZXMnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL29wZW5fbm90aWZpY2F0aW9ucyc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ29wZW5Ob3RpZmljYXRpb25zJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9zdGFydF9hY3Rpdml0eSc6IHtcbiAgICBQT1NUOiB7XG4gICAgICBjb21tYW5kOiAnc3RhcnRBY3Rpdml0eScsXG4gICAgICBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICAgIHJlcXVpcmVkOiBbJ2FwcFBhY2thZ2UnLCAnYXBwQWN0aXZpdHknXSxcbiAgICAgICAgb3B0aW9uYWw6IFsnYXBwV2FpdFBhY2thZ2UnLCAnYXBwV2FpdEFjdGl2aXR5JywgJ2ludGVudEFjdGlvbicsXG4gICAgICAgICAgJ2ludGVudENhdGVnb3J5JywgJ2ludGVudEZsYWdzJywgJ29wdGlvbmFsSW50ZW50QXJndW1lbnRzJywgJ2RvbnRTdG9wQXBwT25SZXNldCddXG4gICAgICB9XG4gICAgfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vZGV2aWNlL3N5c3RlbV9iYXJzJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRTeXN0ZW1CYXJzJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2RldmljZS9kaXNwbGF5X2RlbnNpdHknOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldERpc3BsYXlEZW5zaXR5J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL3NpbXVsYXRvci90b3VjaF9pZCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3RvdWNoSWQnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnbWF0Y2gnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9zaW11bGF0b3IvdG9nZ2xlX3RvdWNoX2lkX2Vucm9sbG1lbnQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICd0b2dnbGVFbnJvbGxUb3VjaElkJywgcGF5bG9hZFBhcmFtczoge29wdGlvbmFsOiBbJ2VuYWJsZWQnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9hcHAvbGF1bmNoJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnbGF1bmNoQXBwJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2FwcC9jbG9zZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2Nsb3NlQXBwJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2FwcC9yZXNldCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3Jlc2V0J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2FwcC9iYWNrZ3JvdW5kJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnYmFja2dyb3VuZCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzZWNvbmRzJ119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vYXBwL2VuZF90ZXN0X2NvdmVyYWdlJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZW5kQ292ZXJhZ2UnLCBwYXlsb2FkUGFyYW1zOiB7cmVxdWlyZWQ6IFsnaW50ZW50JywgJ3BhdGgnXX19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9hcHAvc3RyaW5ncyc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2dldFN0cmluZ3MnLCBwYXlsb2FkUGFyYW1zOiB7b3B0aW9uYWw6IFsnbGFuZ3VhZ2UnLCAnc3RyaW5nRmlsZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2VsZW1lbnQvOmVsZW1lbnRJZC92YWx1ZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3NldFZhbHVlSW1tZWRpYXRlJywgcGF5bG9hZFBhcmFtczoge1xuICAgICAgdmFsaWRhdGU6IChqc29uT2JqKSA9PiAoIXV0aWwuaGFzVmFsdWUoanNvbk9iai52YWx1ZSkgJiYgIXV0aWwuaGFzVmFsdWUoanNvbk9iai50ZXh0KSkgJiZcbiAgICAgICAgICAnd2UgcmVxdWlyZSBvbmUgb2YgXCJ0ZXh0XCIgb3IgXCJ2YWx1ZVwiIHBhcmFtcycsXG4gICAgICBvcHRpb25hbDogWyd2YWx1ZScsICd0ZXh0J10sXG4gICAgICAvLyBXZSB3YW50IHRvIGVpdGhlciBhIHZhbHVlIChvbGQgSlNPTldQKSBvciBhIHRleHQgKG5ldyBXM0MpIHBhcmFtZXRlcixcbiAgICAgIC8vIGJ1dCBvbmx5IHNlbmQgb25lIG9mIHRoZW0gdG8gdGhlIGNvbW1hbmQgKG5vdCBib3RoKS5cbiAgICAgIC8vIFByZWZlciAndmFsdWUnIHNpbmNlIGl0J3MgbW9yZSBiYWNrd2FyZC1jb21wYXRpYmxlLlxuICAgICAgbWFrZUFyZ3M6IChqc29uT2JqKSA9PiBbanNvbk9iai52YWx1ZSB8fCBqc29uT2JqLnRleHRdLFxuICAgIH19XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9lbGVtZW50LzplbGVtZW50SWQvcmVwbGFjZV92YWx1ZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3JlcGxhY2VWYWx1ZScsIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgIHZhbGlkYXRlOiAoanNvbk9iaikgPT4gKCF1dGlsLmhhc1ZhbHVlKGpzb25PYmoudmFsdWUpICYmICF1dGlsLmhhc1ZhbHVlKGpzb25PYmoudGV4dCkpICYmXG4gICAgICAgICAgJ3dlIHJlcXVpcmUgb25lIG9mIFwidGV4dFwiIG9yIFwidmFsdWVcIiBwYXJhbXMnLFxuICAgICAgb3B0aW9uYWw6IFsndmFsdWUnLCAndGV4dCddLFxuICAgICAgLy8gV2Ugd2FudCB0byBlaXRoZXIgYSB2YWx1ZSAob2xkIEpTT05XUCkgb3IgYSB0ZXh0IChuZXcgVzNDKSBwYXJhbWV0ZXIsXG4gICAgICAvLyBidXQgb25seSBzZW5kIG9uZSBvZiB0aGVtIHRvIHRoZSBjb21tYW5kIChub3QgYm90aCkuXG4gICAgICAvLyBQcmVmZXIgJ3ZhbHVlJyBzaW5jZSBpdCdzIG1vcmUgYmFja3dhcmQtY29tcGF0aWJsZS5cbiAgICAgIG1ha2VBcmdzOiAoanNvbk9iaikgPT4gW2pzb25PYmoudmFsdWUgfHwganNvbk9iai50ZXh0XSxcbiAgICB9fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hcHBpdW0vc2V0dGluZ3MnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICd1cGRhdGVTZXR0aW5ncycsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzZXR0aW5ncyddfX0sXG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldFNldHRpbmdzJ31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL3JlY2VpdmVfYXN5bmNfcmVzcG9uc2UnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdyZWNlaXZlQXN5bmNSZXNwb25zZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydyZXNwb25zZSddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2V4ZWN1dGVfZHJpdmVyJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZXhlY3V0ZURyaXZlclNjcmlwdCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzY3JpcHQnXSwgb3B0aW9uYWw6IFsndHlwZScsICd0aW1lb3V0J119fVxuICB9LFxuXG5cbiAgLypcbiAgICogVGhlIFczQyBzcGVjIGhhcyBzb21lIGNoYW5nZXMgdG8gdGhlIHdpcmUgcHJvdG9jb2wuXG4gICAqIGh0dHBzOi8vdzNjLmdpdGh1Yi5pby93ZWJkcml2ZXIvd2ViZHJpdmVyLXNwZWMuaHRtbFxuICAgKiBCZWdpbiB0byBhZGQgdGhvc2UgY2hhbmdlcyBoZXJlLCBrZWVwaW5nIHRoZSBvbGQgdmVyc2lvblxuICAgKiBzaW5jZSBjbGllbnRzIHN0aWxsIGltcGxlbWVudCB0aGVtLlxuICAgKi9cbiAgLy8gb2xkIGFsZXJ0c1xuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hbGVydF90ZXh0Jzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRBbGVydFRleHQnfSxcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3NldEFsZXJ0VGV4dCcsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWyd0ZXh0J119fVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9hY2NlcHRfYWxlcnQnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwb3N0QWNjZXB0QWxlcnQnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9kaXNtaXNzX2FsZXJ0Jzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAncG9zdERpc21pc3NBbGVydCd9XG4gIH0sXG4gIC8vIGh0dHBzOi8vdzNjLmdpdGh1Yi5pby93ZWJkcml2ZXIvd2ViZHJpdmVyLXNwZWMuaHRtbCN1c2VyLXByb21wdHNcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYWxlcnQvdGV4dCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0QWxlcnRUZXh0J30sXG4gICAgUE9TVDoge1xuICAgICAgY29tbWFuZDogJ3NldEFsZXJ0VGV4dCcsXG4gICAgICBwYXlsb2FkUGFyYW1zOiB7XG4gICAgICAgIHZhbGlkYXRlOiAoanNvbk9iaikgPT4gKCF1dGlsLmhhc1ZhbHVlKGpzb25PYmoudmFsdWUpICYmICF1dGlsLmhhc1ZhbHVlKGpzb25PYmoudGV4dCkpICYmXG4gICAgICAgICAgICAnZWl0aGVyIFwidGV4dFwiIG9yIFwidmFsdWVcIiBtdXN0IGJlIHNldCcsXG4gICAgICAgIG9wdGlvbmFsOiBbJ3ZhbHVlJywgJ3RleHQnXSxcbiAgICAgICAgLy8gUHJlZmVyICd2YWx1ZScgc2luY2UgaXQncyBtb3JlIGJhY2t3YXJkLWNvbXBhdGlibGUuXG4gICAgICAgIG1ha2VBcmdzOiAoanNvbk9iaikgPT4gW2pzb25PYmoudmFsdWUgfHwganNvbk9iai50ZXh0XSxcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FsZXJ0L2FjY2VwdCc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ3Bvc3RBY2NlcHRBbGVydCd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FsZXJ0L2Rpc21pc3MnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdwb3N0RGlzbWlzc0FsZXJ0J31cbiAgfSxcbiAgLy8gaHR0cHM6Ly93M2MuZ2l0aHViLmlvL3dlYmRyaXZlci93ZWJkcml2ZXItc3BlYy5odG1sI2dldC1lbGVtZW50LXJlY3RcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL3JlY3QnOiB7XG4gICAgR0VUOiB7Y29tbWFuZDogJ2dldEVsZW1lbnRSZWN0J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZXhlY3V0ZS9zeW5jJzoge1xuICAgIFBPU1Q6IHtjb21tYW5kOiAnZXhlY3V0ZScsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzY3JpcHQnLCAnYXJncyddfX1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZXhlY3V0ZS9hc3luYyc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ2V4ZWN1dGVBc3luYycsIHBheWxvYWRQYXJhbXM6IHtyZXF1aXJlZDogWydzY3JpcHQnLCAnYXJncyddfX1cbiAgfSxcbiAgLy8gUHJlLVczQyBlbmRwb2ludCBmb3IgZWxlbWVudCBzY3JlZW5zaG90XG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3NjcmVlbnNob3QvOmVsZW1lbnRJZCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0RWxlbWVudFNjcmVlbnNob3QnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC9lbGVtZW50LzplbGVtZW50SWQvc2NyZWVuc2hvdCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0RWxlbWVudFNjcmVlbnNob3QnfVxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC93aW5kb3cvcmVjdCc6IHtcbiAgICBHRVQ6IHtjb21tYW5kOiAnZ2V0V2luZG93UmVjdCd9LFxuICAgIFBPU1Q6IHtjb21tYW5kOiAnc2V0V2luZG93UmVjdCd9LFxuICB9LFxuICAnL3Nlc3Npb24vOnNlc3Npb25JZC93aW5kb3cvbWF4aW1pemUnOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdtYXhpbWl6ZVdpbmRvdyd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL3dpbmRvdy9taW5pbWl6ZSc6IHtcbiAgICBQT1NUOiB7Y29tbWFuZDogJ21pbmltaXplV2luZG93J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvd2luZG93L2Z1bGxzY3JlZW4nOiB7XG4gICAgUE9TVDoge2NvbW1hbmQ6ICdmdWxsU2NyZWVuV2luZG93J31cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvZWxlbWVudC86ZWxlbWVudElkL3Byb3BlcnR5LzpuYW1lJzoge1xuICAgIEdFVDoge2NvbW1hbmQ6ICdnZXRQcm9wZXJ0eSd9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2Uvc2V0X2NsaXBib2FyZCc6IHtcbiAgICBQT1NUOiB7XG4gICAgICBjb21tYW5kOiAnc2V0Q2xpcGJvYXJkJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgcmVxdWlyZWQ6IFsnY29udGVudCddLFxuICAgICAgICBvcHRpb25hbDogW1xuICAgICAgICAgICdjb250ZW50VHlwZScsXG4gICAgICAgICAgJ2xhYmVsJyxcbiAgICAgICAgXVxuICAgICAgfSxcbiAgICB9XG4gIH0sXG4gICcvc2Vzc2lvbi86c2Vzc2lvbklkL2FwcGl1bS9kZXZpY2UvZ2V0X2NsaXBib2FyZCc6IHtcbiAgICBQT1NUOiB7XG4gICAgICBjb21tYW5kOiAnZ2V0Q2xpcGJvYXJkJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgb3B0aW9uYWw6IFtcbiAgICAgICAgICAnY29udGVudFR5cGUnLFxuICAgICAgICBdXG4gICAgICB9LFxuICAgIH1cbiAgfSxcbiAgJy9zZXNzaW9uLzpzZXNzaW9uSWQvYXBwaXVtL2NvbXBhcmVfaW1hZ2VzJzoge1xuICAgIFBPU1Q6IHtcbiAgICAgIGNvbW1hbmQ6ICdjb21wYXJlSW1hZ2VzJyxcbiAgICAgIHBheWxvYWRQYXJhbXM6IHtcbiAgICAgICAgcmVxdWlyZWQ6IFsnbW9kZScsICdmaXJzdEltYWdlJywgJ3NlY29uZEltYWdlJ10sXG4gICAgICAgIG9wdGlvbmFsOiBbJ29wdGlvbnMnXVxuICAgICAgfSxcbiAgICB9XG4gIH0sXG59O1xuXG4vLyBkcml2ZXIgY29tbWFuZCBuYW1lc1xubGV0IEFMTF9DT01NQU5EUyA9IFtdO1xuZm9yIChsZXQgdiBvZiBfLnZhbHVlcyhNRVRIT0RfTUFQKSkge1xuICBmb3IgKGxldCBtIG9mIF8udmFsdWVzKHYpKSB7XG4gICAgaWYgKG0uY29tbWFuZCkge1xuICAgICAgQUxMX0NPTU1BTkRTLnB1c2gobS5jb21tYW5kKTtcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgUkVfRVNDQVBFID0gL1stW1xcXXt9KCkrPy4sXFxcXF4kfCNcXHNdL2c7XG5jb25zdCBSRV9QQVJBTSA9IC8oWzoqXSkoXFx3KykvZztcblxuY2xhc3MgUm91dGUge1xuICBjb25zdHJ1Y3RvciAocm91dGUpIHtcbiAgICB0aGlzLnBhcmFtTmFtZXMgPSBbXTtcblxuICAgIGxldCByZVN0ciA9IHJvdXRlLnJlcGxhY2UoUkVfRVNDQVBFLCAnXFxcXCQmJyk7XG4gICAgcmVTdHIgPSByZVN0ci5yZXBsYWNlKFJFX1BBUkFNLCAoXywgbW9kZSwgbmFtZSkgPT4ge1xuICAgICAgdGhpcy5wYXJhbU5hbWVzLnB1c2gobmFtZSk7XG4gICAgICByZXR1cm4gbW9kZSA9PT0gJzonID8gJyhbXi9dKiknIDogJyguKiknO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGVSZWdleHAgPSBuZXcgUmVnRXhwKGBeJHtyZVN0cn0kYCk7XG4gIH1cblxuICBwYXJzZSAodXJsKSB7XG4gICAgLy9pZiAodXJsLmluZGV4T2YoJ3RpbWVvdXRzJykgIT09IC0xICYmIHRoaXMucm91dGVSZWdleHAudG9TdHJpbmcoKS5pbmRleE9mKCd0aW1lb3V0cycpICE9PSAtMSkge1xuICAgIC8vZGVidWdnZXI7XG4gICAgLy99XG4gICAgbGV0IG1hdGNoZXMgPSB1cmwubWF0Y2godGhpcy5yb3V0ZVJlZ2V4cCk7XG4gICAgaWYgKCFtYXRjaGVzKSByZXR1cm47IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgY3VybHlcbiAgICBsZXQgaSA9IDA7XG4gICAgbGV0IHBhcmFtcyA9IHt9O1xuICAgIHdoaWxlIChpIDwgdGhpcy5wYXJhbU5hbWVzLmxlbmd0aCkge1xuICAgICAgY29uc3QgcGFyYW1OYW1lID0gdGhpcy5wYXJhbU5hbWVzW2krK107XG4gICAgICBwYXJhbXNbcGFyYW1OYW1lXSA9IG1hdGNoZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBwYXJhbXM7XG4gIH1cbn1cblxuZnVuY3Rpb24gcm91dGVUb0NvbW1hbmROYW1lIChlbmRwb2ludCwgbWV0aG9kLCBiYXNlUGF0aCA9IERFRkFVTFRfQkFTRV9QQVRIKSB7XG4gIGxldCBkc3RSb3V0ZSA9IG51bGw7XG5cbiAgLy8gcmVtb3ZlIGFueSBxdWVyeSBzdHJpbmdcbiAgaWYgKGVuZHBvaW50LmluY2x1ZGVzKCc/JykpIHtcbiAgICBlbmRwb2ludCA9IGVuZHBvaW50LnNsaWNlKDAsIGVuZHBvaW50LmluZGV4T2YoJz8nKSk7XG4gIH1cblxuICBjb25zdCBhY3R1YWxFbmRwb2ludCA9IGVuZHBvaW50ID09PSAnLycgPyAnJyA6XG4gICAgKF8uc3RhcnRzV2l0aChlbmRwb2ludCwgJy8nKSA/IGVuZHBvaW50IDogYC8ke2VuZHBvaW50fWApO1xuXG4gIGZvciAobGV0IGN1cnJlbnRSb3V0ZSBvZiBfLmtleXMoTUVUSE9EX01BUCkpIHtcbiAgICBjb25zdCByb3V0ZSA9IG5ldyBSb3V0ZShgJHtiYXNlUGF0aH0ke2N1cnJlbnRSb3V0ZX1gKTtcbiAgICAvLyB3ZSBkb24ndCBjYXJlIGFib3V0IHRoZSBhY3R1YWwgc2Vzc2lvbiBpZCBmb3IgbWF0Y2hpbmdcbiAgICBpZiAocm91dGUucGFyc2UoYCR7YmFzZVBhdGh9L3Nlc3Npb24vaWdub3JlZC1zZXNzaW9uLWlkJHthY3R1YWxFbmRwb2ludH1gKSB8fFxuICAgICAgICByb3V0ZS5wYXJzZShgJHtiYXNlUGF0aH0ke2FjdHVhbEVuZHBvaW50fWApIHx8IHJvdXRlLnBhcnNlKGFjdHVhbEVuZHBvaW50KSkge1xuICAgICAgZHN0Um91dGUgPSBjdXJyZW50Um91dGU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKCFkc3RSb3V0ZSkgcmV0dXJuOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGN1cmx5XG5cbiAgY29uc3QgbWV0aG9kcyA9IF8uZ2V0KE1FVEhPRF9NQVAsIGRzdFJvdXRlKTtcbiAgbWV0aG9kID0gXy50b1VwcGVyKG1ldGhvZCk7XG4gIGlmIChfLmhhcyhtZXRob2RzLCBtZXRob2QpKSB7XG4gICAgY29uc3QgZHN0TWV0aG9kID0gXy5nZXQobWV0aG9kcywgbWV0aG9kKTtcbiAgICBpZiAoZHN0TWV0aG9kLmNvbW1hbmQpIHtcbiAgICAgIHJldHVybiBkc3RNZXRob2QuY29tbWFuZDtcbiAgICB9XG4gIH1cbn1cblxuLy8gZHJpdmVyIGNvbW1hbmRzIHRoYXQgZG8gbm90IHJlcXVpcmUgYSBzZXNzaW9uIHRvIGFscmVhZHkgZXhpc3RcbmNvbnN0IE5PX1NFU1NJT05fSURfQ09NTUFORFMgPSBbJ2NyZWF0ZVNlc3Npb24nLCAnZ2V0U3RhdHVzJywgJ2dldFNlc3Npb25zJ107XG5cbmV4cG9ydCB7IE1FVEhPRF9NQVAsIEFMTF9DT01NQU5EUywgTk9fU0VTU0lPTl9JRF9DT01NQU5EUywgcm91dGVUb0NvbW1hbmROYW1lIH07XG4iXSwiZmlsZSI6ImxpYi9wcm90b2NvbC9yb3V0ZXMuanMiLCJzb3VyY2VSb290IjoiLi4vLi4vLi4ifQ==
