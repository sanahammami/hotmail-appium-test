"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard");

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BaseDriver = void 0;

require("source-map-support/register");

var _protocol = require("../protocol");

var _os = _interopRequireDefault(require("os"));

var _commands = _interopRequireDefault(require("./commands"));

var helpers = _interopRequireWildcard(require("./helpers"));

var _logger = _interopRequireDefault(require("./logger"));

var _deviceSettings = _interopRequireDefault(require("./device-settings"));

var _desiredCaps = require("./desired-caps");

var _capabilities = require("./capabilities");

var _bluebird = _interopRequireDefault(require("bluebird"));

var _lodash = _interopRequireDefault(require("lodash"));

var _appiumSupport = require("appium-support");

var _imageElement = require("./image-element");

_bluebird.default.config({
  cancellation: true
});

const NEW_COMMAND_TIMEOUT_MS = 60 * 1000;
const EVENT_SESSION_INIT = 'newSessionRequested';
const EVENT_SESSION_START = 'newSessionStarted';
const EVENT_SESSION_QUIT_START = 'quitSessionRequested';
const EVENT_SESSION_QUIT_DONE = 'quitSessionFinished';

class BaseDriver extends _protocol.Protocol {
  constructor(opts = {}, shouldValidateCaps = true) {
    super();
    this.sessionId = null;
    this.opts = opts;
    this.caps = null;
    this.helpers = helpers;
    this.basePath = _protocol.DEFAULT_BASE_PATH;
    this.relaxedSecurityEnabled = false;
    this.allowInsecure = [];
    this.denyInsecure = [];
    this.newCommandTimeoutMs = NEW_COMMAND_TIMEOUT_MS;
    this.implicitWaitMs = 0;
    this._constraints = _lodash.default.cloneDeep(_desiredCaps.desiredCapabilityConstraints);
    this.locatorStrategies = [];
    this.webLocatorStrategies = [];
    this.opts.tmpDir = this.opts.tmpDir || process.env.APPIUM_TMP_DIR || _os.default.tmpdir();
    this.curCommand = _bluebird.default.resolve();
    this.curCommandCancellable = _bluebird.default.resolve();
    this.shutdownUnexpectedly = false;
    this.noCommandTimer = null;
    this.shouldValidateCaps = shouldValidateCaps;
    this.settings = new _deviceSettings.default({}, _lodash.default.noop);
    this.resetOnUnexpectedShutdown();
    this.initialOpts = _lodash.default.cloneDeep(this.opts);
    this.managedDrivers = [];
    this._eventHistory = {
      commands: []
    };
    this._imgElCache = (0, _imageElement.makeImageElementCache)();
    this.protocol = null;
  }

  get driverData() {
    return {};
  }

  get isCommandsQueueEnabled() {
    return true;
  }

  get eventHistory() {
    return _lodash.default.cloneDeep(this._eventHistory);
  }

  logEvent(eventName) {
    if (eventName === 'commands') {
      throw new Error('Cannot log commands directly');
    }

    if (typeof eventName !== 'string') {
      throw new Error(`Invalid eventName ${eventName}`);
    }

    if (!this._eventHistory[eventName]) {
      this._eventHistory[eventName] = [];
    }

    let ts = Date.now();
    let logTime = new Date(ts).toTimeString();

    this._eventHistory[eventName].push(ts);

    _logger.default.debug(`Event '${eventName}' logged at ${ts} (${logTime})`);
  }

  async getStatus() {
    return {};
  }

  resetOnUnexpectedShutdown() {
    if (this.onUnexpectedShutdown && !this.onUnexpectedShutdown.isFulfilled()) {
      this.onUnexpectedShutdown.cancel();
    }

    this.onUnexpectedShutdown = new _bluebird.default((resolve, reject, onCancel) => {
      onCancel(() => reject(new _bluebird.default.CancellationError()));
      this.unexpectedShutdownDeferred = {
        resolve,
        reject
      };
    });
    this.onUnexpectedShutdown.catch(() => {});
  }

  set desiredCapConstraints(constraints) {
    this._constraints = Object.assign(this._constraints, constraints);

    for (const [, value] of _lodash.default.toPairs(this._constraints)) {
      if (value && value.presence === true) {
        value.presence = {
          allowEmpty: false
        };
      }
    }
  }

  get desiredCapConstraints() {
    return this._constraints;
  }

  sessionExists(sessionId) {
    if (!sessionId) return false;
    return sessionId === this.sessionId;
  }

  driverForSession() {
    return this;
  }

  logExtraCaps(caps) {
    let extraCaps = _lodash.default.difference(_lodash.default.keys(caps), _lodash.default.keys(this._constraints));

    if (extraCaps.length) {
      _logger.default.warn(`The following capabilities were provided, but are not ` + `recognized by Appium:`);

      for (const cap of extraCaps) {
        _logger.default.warn(`  ${cap}`);
      }
    }
  }

  validateDesiredCaps(caps) {
    if (!this.shouldValidateCaps) {
      return true;
    }

    try {
      (0, _capabilities.validateCaps)(caps, this._constraints);
    } catch (e) {
      _logger.default.errorAndThrow(new _protocol.errors.SessionNotCreatedError(`The desiredCapabilities object was not valid for the ` + `following reason(s): ${e.message}`));
    }

    this.logExtraCaps(caps);
    return true;
  }

  isMjsonwpProtocol() {
    return this.protocol === _protocol.PROTOCOLS.MJSONWP;
  }

  isW3CProtocol() {
    return this.protocol === _protocol.PROTOCOLS.W3C;
  }

  setProtocolMJSONWP() {
    this.protocol = _protocol.PROTOCOLS.MJSONWP;
  }

  setProtocolW3C() {
    this.protocol = _protocol.PROTOCOLS.W3C;
  }

  isFeatureEnabled(name) {
    if (this.denyInsecure && _lodash.default.includes(this.denyInsecure, name)) {
      return false;
    }

    if (this.allowInsecure && _lodash.default.includes(this.allowInsecure, name)) {
      return true;
    }

    if (this.relaxedSecurityEnabled) {
      return true;
    }

    return false;
  }

  ensureFeatureEnabled(name) {
    if (!this.isFeatureEnabled(name)) {
      throw new Error(`Potentially insecure feature '${name}' has not been ` + `enabled. If you want to enable this feature and accept ` + `the security ramifications, please do so by following ` + `the documented instructions at https://github.com/appium` + `/appium/blob/master/docs/en/writing-running-appium/security.md`);
    }
  }

  async executeCommand(cmd, ...args) {
    let startTime = Date.now();

    if (cmd === 'createSession') {
      this.protocol = (0, _protocol.determineProtocol)(...args);
      this.logEvent(EVENT_SESSION_INIT);
    } else if (cmd === 'deleteSession') {
      this.logEvent(EVENT_SESSION_QUIT_START);
    }

    this.clearNewCommandTimeout();
    const imgElId = (0, _imageElement.getImgElFromArgs)(args);

    if (!this[cmd] && !imgElId) {
      throw new _protocol.errors.NotYetImplementedError();
    }

    let res;

    if (this.isCommandsQueueEnabled && cmd !== 'executeDriverScript') {
      const nextCommand = this.curCommand.then(() => {
        if (this.shutdownUnexpectedly) {
          return _bluebird.default.reject(new _protocol.errors.NoSuchDriverError('The driver was unexpectedly shut down!'));
        }

        let reject;
        this.curCommandCancellable = _bluebird.default.resolve().then(() => {
          const cancelPromise = new _bluebird.default(function (_, _reject) {
            reject = _reject;
          });
          return _bluebird.default.race([imgElId ? _imageElement.ImageElement.execute(this, cmd, imgElId, ...args) : this[cmd](...args), cancelPromise]);
        });

        this.curCommandCancellable.cancel = function cancel(err) {
          if (reject) {
            reject(err);
          }
        };

        return this.curCommandCancellable;
      });
      this.curCommand = nextCommand.catch(() => {});
      res = await nextCommand;
    } else {
      if (this.shutdownUnexpectedly) {
        throw new _protocol.errors.NoSuchDriverError('The driver was unexpectedly shut down!');
      }

      res = await this[cmd](...args);
    }

    if (this.isCommandsQueueEnabled && cmd !== 'deleteSession') {
      this.startNewCommandTimeout();
    }

    const endTime = Date.now();

    this._eventHistory.commands.push({
      cmd,
      startTime,
      endTime
    });

    if (cmd === 'createSession') {
      this.logEvent(EVENT_SESSION_START);
    } else if (cmd === 'deleteSession') {
      this.logEvent(EVENT_SESSION_QUIT_DONE);
    }

    return res;
  }

  async startUnexpectedShutdown(err = new _protocol.errors.NoSuchDriverError('The driver was unexpectedly shut down!')) {
    this.unexpectedShutdownDeferred.reject(err);
    this.shutdownUnexpectedly = true;
    await this.deleteSession(this.sessionId);
    this.shutdownUnexpectedly = false;
    this.curCommandCancellable.cancel(err);
  }

  validateLocatorStrategy(strategy, webContext = false) {
    let validStrategies = this.locatorStrategies;

    _logger.default.debug(`Valid locator strategies for this request: ${validStrategies.join(', ')}`);

    if (webContext) {
      validStrategies = validStrategies.concat(this.webLocatorStrategies);
    }

    if (!_lodash.default.includes(validStrategies, strategy)) {
      throw new _protocol.errors.InvalidSelectorError(`Locator Strategy '${strategy}' is not supported for this session`);
    }
  }

  async reset() {
    _logger.default.debug('Resetting app mid-session');

    _logger.default.debug('Running generic full reset');

    let currentConfig = {};

    for (let property of ['implicitWaitMs', 'newCommandTimeoutMs', 'sessionId', 'resetOnUnexpectedShutdown']) {
      currentConfig[property] = this[property];
    }

    this.resetOnUnexpectedShutdown = () => {};

    const args = this.protocol === _protocol.PROTOCOLS.W3C ? [undefined, undefined, {
      alwaysMatch: this.caps,
      firstMatch: [{}]
    }] : [this.caps];

    try {
      await this.deleteSession(this.sessionId);

      _logger.default.debug('Restarting app');

      await this.createSession(...args);
    } finally {
      for (let [key, value] of _lodash.default.toPairs(currentConfig)) {
        this[key] = value;
      }
    }

    this.clearNewCommandTimeout();
  }

  async getSwipeOptions(gestures, touchCount = 1) {
    let startX = this.helpers.getCoordDefault(gestures[0].options.x),
        startY = this.helpers.getCoordDefault(gestures[0].options.y),
        endX = this.helpers.getCoordDefault(gestures[2].options.x),
        endY = this.helpers.getCoordDefault(gestures[2].options.y),
        duration = this.helpers.getSwipeTouchDuration(gestures[1]),
        element = gestures[0].options.element,
        destElement = gestures[2].options.element || gestures[0].options.element;

    if (_appiumSupport.util.hasValue(destElement)) {
      let locResult = await this.getLocationInView(destElement);
      let sizeResult = await this.getSize(destElement);
      let offsetX = Math.abs(endX) < 1 && Math.abs(endX) > 0 ? sizeResult.width * endX : endX;
      let offsetY = Math.abs(endY) < 1 && Math.abs(endY) > 0 ? sizeResult.height * endY : endY;
      endX = locResult.x + offsetX;
      endY = locResult.y + offsetY;

      if (_appiumSupport.util.hasValue(element)) {
        let firstElLocation = await this.getLocationInView(element);
        endX -= firstElLocation.x;
        endY -= firstElLocation.y;
      }
    }

    return {
      startX,
      startY,
      endX,
      endY,
      duration,
      touchCount,
      element
    };
  }

  proxyActive() {
    return false;
  }

  getProxyAvoidList() {
    return [];
  }

  canProxy() {
    return false;
  }

  proxyRouteIsAvoided(sessionId, method, url) {
    for (let avoidSchema of this.getProxyAvoidList(sessionId)) {
      if (!_lodash.default.isArray(avoidSchema) || avoidSchema.length !== 2) {
        throw new Error('Proxy avoidance must be a list of pairs');
      }

      let [avoidMethod, avoidPathRegex] = avoidSchema;

      if (!_lodash.default.includes(['GET', 'POST', 'DELETE'], avoidMethod)) {
        throw new Error(`Unrecognized proxy avoidance method '${avoidMethod}'`);
      }

      if (!_lodash.default.isRegExp(avoidPathRegex)) {
        throw new Error('Proxy avoidance path must be a regular expression');
      }

      let normalizedUrl = url.replace(new RegExp(`^${_lodash.default.escapeRegExp(this.basePath)}`), '');

      if (avoidMethod === method && avoidPathRegex.test(normalizedUrl)) {
        return true;
      }
    }

    return false;
  }

  addManagedDriver(driver) {
    this.managedDrivers.push(driver);
  }

  getManagedDrivers() {
    return this.managedDrivers;
  }

  registerImageElement(imgEl) {
    this._imgElCache.set(imgEl.id, imgEl);

    const protoKey = this.isW3CProtocol() ? _protocol.W3C_ELEMENT_KEY : _protocol.MJSONWP_ELEMENT_KEY;
    return imgEl.asElement(protoKey);
  }

}

exports.BaseDriver = BaseDriver;

for (let [cmd, fn] of _lodash.default.toPairs(_commands.default)) {
  BaseDriver.prototype[cmd] = fn;
}

var _default = BaseDriver;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9iYXNlZHJpdmVyL2RyaXZlci5qcyJdLCJuYW1lcyI6WyJCIiwiY29uZmlnIiwiY2FuY2VsbGF0aW9uIiwiTkVXX0NPTU1BTkRfVElNRU9VVF9NUyIsIkVWRU5UX1NFU1NJT05fSU5JVCIsIkVWRU5UX1NFU1NJT05fU1RBUlQiLCJFVkVOVF9TRVNTSU9OX1FVSVRfU1RBUlQiLCJFVkVOVF9TRVNTSU9OX1FVSVRfRE9ORSIsIkJhc2VEcml2ZXIiLCJQcm90b2NvbCIsImNvbnN0cnVjdG9yIiwib3B0cyIsInNob3VsZFZhbGlkYXRlQ2FwcyIsInNlc3Npb25JZCIsImNhcHMiLCJoZWxwZXJzIiwiYmFzZVBhdGgiLCJERUZBVUxUX0JBU0VfUEFUSCIsInJlbGF4ZWRTZWN1cml0eUVuYWJsZWQiLCJhbGxvd0luc2VjdXJlIiwiZGVueUluc2VjdXJlIiwibmV3Q29tbWFuZFRpbWVvdXRNcyIsImltcGxpY2l0V2FpdE1zIiwiX2NvbnN0cmFpbnRzIiwiXyIsImNsb25lRGVlcCIsImRlc2lyZWRDYXBhYmlsaXR5Q29uc3RyYWludHMiLCJsb2NhdG9yU3RyYXRlZ2llcyIsIndlYkxvY2F0b3JTdHJhdGVnaWVzIiwidG1wRGlyIiwicHJvY2VzcyIsImVudiIsIkFQUElVTV9UTVBfRElSIiwib3MiLCJ0bXBkaXIiLCJjdXJDb21tYW5kIiwicmVzb2x2ZSIsImN1ckNvbW1hbmRDYW5jZWxsYWJsZSIsInNodXRkb3duVW5leHBlY3RlZGx5Iiwibm9Db21tYW5kVGltZXIiLCJzZXR0aW5ncyIsIkRldmljZVNldHRpbmdzIiwibm9vcCIsInJlc2V0T25VbmV4cGVjdGVkU2h1dGRvd24iLCJpbml0aWFsT3B0cyIsIm1hbmFnZWREcml2ZXJzIiwiX2V2ZW50SGlzdG9yeSIsImNvbW1hbmRzIiwiX2ltZ0VsQ2FjaGUiLCJwcm90b2NvbCIsImRyaXZlckRhdGEiLCJpc0NvbW1hbmRzUXVldWVFbmFibGVkIiwiZXZlbnRIaXN0b3J5IiwibG9nRXZlbnQiLCJldmVudE5hbWUiLCJFcnJvciIsInRzIiwiRGF0ZSIsIm5vdyIsImxvZ1RpbWUiLCJ0b1RpbWVTdHJpbmciLCJwdXNoIiwibG9nIiwiZGVidWciLCJnZXRTdGF0dXMiLCJvblVuZXhwZWN0ZWRTaHV0ZG93biIsImlzRnVsZmlsbGVkIiwiY2FuY2VsIiwicmVqZWN0Iiwib25DYW5jZWwiLCJDYW5jZWxsYXRpb25FcnJvciIsInVuZXhwZWN0ZWRTaHV0ZG93bkRlZmVycmVkIiwiY2F0Y2giLCJkZXNpcmVkQ2FwQ29uc3RyYWludHMiLCJjb25zdHJhaW50cyIsIk9iamVjdCIsImFzc2lnbiIsInZhbHVlIiwidG9QYWlycyIsInByZXNlbmNlIiwiYWxsb3dFbXB0eSIsInNlc3Npb25FeGlzdHMiLCJkcml2ZXJGb3JTZXNzaW9uIiwibG9nRXh0cmFDYXBzIiwiZXh0cmFDYXBzIiwiZGlmZmVyZW5jZSIsImtleXMiLCJsZW5ndGgiLCJ3YXJuIiwiY2FwIiwidmFsaWRhdGVEZXNpcmVkQ2FwcyIsImUiLCJlcnJvckFuZFRocm93IiwiZXJyb3JzIiwiU2Vzc2lvbk5vdENyZWF0ZWRFcnJvciIsIm1lc3NhZ2UiLCJpc01qc29ud3BQcm90b2NvbCIsIlBST1RPQ09MUyIsIk1KU09OV1AiLCJpc1czQ1Byb3RvY29sIiwiVzNDIiwic2V0UHJvdG9jb2xNSlNPTldQIiwic2V0UHJvdG9jb2xXM0MiLCJpc0ZlYXR1cmVFbmFibGVkIiwibmFtZSIsImluY2x1ZGVzIiwiZW5zdXJlRmVhdHVyZUVuYWJsZWQiLCJleGVjdXRlQ29tbWFuZCIsImNtZCIsImFyZ3MiLCJzdGFydFRpbWUiLCJjbGVhck5ld0NvbW1hbmRUaW1lb3V0IiwiaW1nRWxJZCIsIk5vdFlldEltcGxlbWVudGVkRXJyb3IiLCJyZXMiLCJuZXh0Q29tbWFuZCIsInRoZW4iLCJOb1N1Y2hEcml2ZXJFcnJvciIsImNhbmNlbFByb21pc2UiLCJfcmVqZWN0IiwicmFjZSIsIkltYWdlRWxlbWVudCIsImV4ZWN1dGUiLCJlcnIiLCJzdGFydE5ld0NvbW1hbmRUaW1lb3V0IiwiZW5kVGltZSIsInN0YXJ0VW5leHBlY3RlZFNodXRkb3duIiwiZGVsZXRlU2Vzc2lvbiIsInZhbGlkYXRlTG9jYXRvclN0cmF0ZWd5Iiwic3RyYXRlZ3kiLCJ3ZWJDb250ZXh0IiwidmFsaWRTdHJhdGVnaWVzIiwiam9pbiIsImNvbmNhdCIsIkludmFsaWRTZWxlY3RvckVycm9yIiwicmVzZXQiLCJjdXJyZW50Q29uZmlnIiwicHJvcGVydHkiLCJ1bmRlZmluZWQiLCJhbHdheXNNYXRjaCIsImZpcnN0TWF0Y2giLCJjcmVhdGVTZXNzaW9uIiwia2V5IiwiZ2V0U3dpcGVPcHRpb25zIiwiZ2VzdHVyZXMiLCJ0b3VjaENvdW50Iiwic3RhcnRYIiwiZ2V0Q29vcmREZWZhdWx0Iiwib3B0aW9ucyIsIngiLCJzdGFydFkiLCJ5IiwiZW5kWCIsImVuZFkiLCJkdXJhdGlvbiIsImdldFN3aXBlVG91Y2hEdXJhdGlvbiIsImVsZW1lbnQiLCJkZXN0RWxlbWVudCIsInV0aWwiLCJoYXNWYWx1ZSIsImxvY1Jlc3VsdCIsImdldExvY2F0aW9uSW5WaWV3Iiwic2l6ZVJlc3VsdCIsImdldFNpemUiLCJvZmZzZXRYIiwiTWF0aCIsImFicyIsIndpZHRoIiwib2Zmc2V0WSIsImhlaWdodCIsImZpcnN0RWxMb2NhdGlvbiIsInByb3h5QWN0aXZlIiwiZ2V0UHJveHlBdm9pZExpc3QiLCJjYW5Qcm94eSIsInByb3h5Um91dGVJc0F2b2lkZWQiLCJtZXRob2QiLCJ1cmwiLCJhdm9pZFNjaGVtYSIsImlzQXJyYXkiLCJhdm9pZE1ldGhvZCIsImF2b2lkUGF0aFJlZ2V4IiwiaXNSZWdFeHAiLCJub3JtYWxpemVkVXJsIiwicmVwbGFjZSIsIlJlZ0V4cCIsImVzY2FwZVJlZ0V4cCIsInRlc3QiLCJhZGRNYW5hZ2VkRHJpdmVyIiwiZHJpdmVyIiwiZ2V0TWFuYWdlZERyaXZlcnMiLCJyZWdpc3RlckltYWdlRWxlbWVudCIsImltZ0VsIiwic2V0IiwiaWQiLCJwcm90b0tleSIsIlczQ19FTEVNRU5UX0tFWSIsIk1KU09OV1BfRUxFTUVO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LEtBQUtoSixjQUFaO0FBQ0Q7O0FBRURpSixFQUFBQSxvQkFBb0IsQ0FBRUMsS0FBRixFQUFTO0FBQzNCLFNBQUsvSSxXQUFMLENBQWlCZ0osR0FBakIsQ0FBcUJELEtBQUssQ0FBQ0UsRUFBM0IsRUFBK0JGLEtBQS9COztBQUNBLFVBQU1HLFFBQVEsR0FBRyxLQUFLL0YsYUFBTCxLQUF1QmdHLHlCQUF2QixHQUF5Q0MsNkJBQTFEO0FBQ0EsV0FBT0wsS0FBSyxDQUFDTSxTQUFOLENBQWdCSCxRQUFoQixDQUFQO0FBQ0Q7O0FBbmdCK0I7Ozs7QUFzZ0JsQyxLQUFLLElBQUksQ0FBQ3RGLEdBQUQsRUFBTTBGLEVBQU4sQ0FBVCxJQUFzQjlLLGdCQUFFc0QsT0FBRixDQUFVL0IsaUJBQVYsQ0FBdEIsRUFBMkM7QUFDekN2QyxFQUFBQSxVQUFVLENBQUMrTCxTQUFYLENBQXFCM0YsR0FBckIsSUFBNEIwRixFQUE1QjtBQUNEOztlQUdjOUwsVSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFByb3RvY29sLCBlcnJvcnMsIERFRkFVTFRfQkFTRV9QQVRILCBXM0NfRUxFTUVOVF9LRVksXG4gICAgICAgICBNSlNPTldQX0VMRU1FTlRfS0VZLCBQUk9UT0NPTFMsIGRldGVybWluZVByb3RvY29sIH0gZnJvbSAnLi4vcHJvdG9jb2wnO1xuaW1wb3J0IG9zIGZyb20gJ29zJztcbmltcG9ydCBjb21tYW5kcyBmcm9tICcuL2NvbW1hbmRzJztcbmltcG9ydCAqIGFzIGhlbHBlcnMgZnJvbSAnLi9oZWxwZXJzJztcbmltcG9ydCBsb2cgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IERldmljZVNldHRpbmdzIGZyb20gJy4vZGV2aWNlLXNldHRpbmdzJztcbmltcG9ydCB7IGRlc2lyZWRDYXBhYmlsaXR5Q29uc3RyYWludHMgfSBmcm9tICcuL2Rlc2lyZWQtY2Fwcyc7XG5pbXBvcnQgeyB2YWxpZGF0ZUNhcHMgfSBmcm9tICcuL2NhcGFiaWxpdGllcyc7XG5pbXBvcnQgQiBmcm9tICdibHVlYmlyZCc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgdXRpbCB9IGZyb20gJ2FwcGl1bS1zdXBwb3J0JztcbmltcG9ydCB7IEltYWdlRWxlbWVudCwgbWFrZUltYWdlRWxlbWVudENhY2hlLCBnZXRJbWdFbEZyb21BcmdzIH0gZnJvbSAnLi9pbWFnZS1lbGVtZW50JztcblxuXG5CLmNvbmZpZyh7XG4gIGNhbmNlbGxhdGlvbjogdHJ1ZSxcbn0pO1xuXG5jb25zdCBORVdfQ09NTUFORF9USU1FT1VUX01TID0gNjAgKiAxMDAwO1xuXG5jb25zdCBFVkVOVF9TRVNTSU9OX0lOSVQgPSAnbmV3U2Vzc2lvblJlcXVlc3RlZCc7XG5jb25zdCBFVkVOVF9TRVNTSU9OX1NUQVJUID0gJ25ld1Nlc3Npb25TdGFydGVkJztcbmNvbnN0IEVWRU5UX1NFU1NJT05fUVVJVF9TVEFSVCA9ICdxdWl0U2Vzc2lvblJlcXVlc3RlZCc7XG5jb25zdCBFVkVOVF9TRVNTSU9OX1FVSVRfRE9ORSA9ICdxdWl0U2Vzc2lvbkZpbmlzaGVkJztcblxuY2xhc3MgQmFzZURyaXZlciBleHRlbmRzIFByb3RvY29sIHtcblxuICBjb25zdHJ1Y3RvciAob3B0cyA9IHt9LCBzaG91bGRWYWxpZGF0ZUNhcHMgPSB0cnVlKSB7XG4gICAgc3VwZXIoKTtcblxuICAgIC8vIHNldHVwIHN0YXRlXG4gICAgdGhpcy5zZXNzaW9uSWQgPSBudWxsO1xuICAgIHRoaXMub3B0cyA9IG9wdHM7XG4gICAgdGhpcy5jYXBzID0gbnVsbDtcbiAgICB0aGlzLmhlbHBlcnMgPSBoZWxwZXJzO1xuXG4gICAgLy8gYmFzZVBhdGggaXMgdXNlZCBmb3Igc2V2ZXJhbCBwdXJwb3NlcywgZm9yIGV4YW1wbGUgaW4gc2V0dGluZyB1cFxuICAgIC8vIHByb3h5aW5nIHRvIG90aGVyIGRyaXZlcnMsIHNpbmNlIHdlIG5lZWQgdG8ga25vdyB3aGF0IHRoZSBiYXNlIHBhdGhcbiAgICAvLyBvZiBhbnkgaW5jb21pbmcgcmVxdWVzdCBtaWdodCBsb29rIGxpa2UuIFdlIHNldCBpdCB0byB0aGUgZGVmYXVsdFxuICAgIC8vIGluaXRpYWxseSBidXQgaXQgaXMgYXV0b21hdGljYWxseSB1cGRhdGVkIGR1cmluZyBhbnkgYWN0dWFsIHByb2dyYW1cbiAgICAvLyBleGVjdXRpb24gYnkgdGhlIHJvdXRlQ29uZmlndXJpbmdGdW5jdGlvbiwgd2hpY2ggaXMgbmVjZXNzYXJpbHkgcnVuIGFzXG4gICAgLy8gdGhlIGVudHJ5cG9pbnQgZm9yIGFueSBBcHBpdW0gc2VydmVyXG4gICAgdGhpcy5iYXNlUGF0aCA9IERFRkFVTFRfQkFTRV9QQVRIO1xuXG4gICAgLy8gaW5pdGlhbGl6ZSBzZWN1cml0eSBtb2Rlc1xuICAgIHRoaXMucmVsYXhlZFNlY3VyaXR5RW5hYmxlZCA9IGZhbHNlO1xuICAgIHRoaXMuYWxsb3dJbnNlY3VyZSA9IFtdO1xuICAgIHRoaXMuZGVueUluc2VjdXJlID0gW107XG5cbiAgICAvLyB0aW1lb3V0IGluaXRpYWxpemF0aW9uXG4gICAgdGhpcy5uZXdDb21tYW5kVGltZW91dE1zID0gTkVXX0NPTU1BTkRfVElNRU9VVF9NUztcbiAgICB0aGlzLmltcGxpY2l0V2FpdE1zID0gMDtcblxuICAgIHRoaXMuX2NvbnN0cmFpbnRzID0gXy5jbG9uZURlZXAoZGVzaXJlZENhcGFiaWxpdHlDb25zdHJhaW50cyk7XG4gICAgdGhpcy5sb2NhdG9yU3RyYXRlZ2llcyA9IFtdO1xuICAgIHRoaXMud2ViTG9jYXRvclN0cmF0ZWdpZXMgPSBbXTtcblxuICAgIC8vIHVzZSBhIGN1c3RvbSB0bXAgZGlyIHRvIGF2b2lkIGxvc2luZyBkYXRhIGFuZCBhcHAgd2hlbiBjb21wdXRlciBpc1xuICAgIC8vIHJlc3RhcnRlZFxuICAgIHRoaXMub3B0cy50bXBEaXIgPSB0aGlzLm9wdHMudG1wRGlyIHx8XG4gICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW52LkFQUElVTV9UTVBfRElSIHx8XG4gICAgICAgICAgICAgICAgICAgICAgIG9zLnRtcGRpcigpO1xuXG4gICAgLy8gYmFzZS1kcml2ZXIgaW50ZXJuYWxzXG4gICAgdGhpcy5jdXJDb21tYW5kID0gQi5yZXNvbHZlKCk7IC8vIHNlZSBub3RlIGluIGV4ZWN1dGVcbiAgICB0aGlzLmN1ckNvbW1hbmRDYW5jZWxsYWJsZSA9IEIucmVzb2x2ZSgpOyAvLyBzZWUgbm90ZSBpbiBleGVjdXRlXG4gICAgdGhpcy5zaHV0ZG93blVuZXhwZWN0ZWRseSA9IGZhbHNlO1xuICAgIHRoaXMubm9Db21tYW5kVGltZXIgPSBudWxsO1xuICAgIHRoaXMuc2hvdWxkVmFsaWRhdGVDYXBzID0gc2hvdWxkVmFsaWRhdGVDYXBzO1xuXG4gICAgLy8gc2V0dGluZ3Mgc2hvdWxkIGJlIGluc3RhbnRpYXRlZCBieSBkcml2ZXJzIHdoaWNoIGV4dGVuZCBCYXNlRHJpdmVyLCBidXRcbiAgICAvLyB3ZSBzZXQgaXQgdG8gYW4gZW1wdHkgRGV2aWNlU2V0dGluZ3MgaW5zdGFuY2UgaGVyZSB0byBtYWtlIHN1cmUgdGhhdCB0aGVcbiAgICAvLyBkZWZhdWx0IHNldHRpbmdzIGFyZSBhcHBsaWVkIGV2ZW4gaWYgYW4gZXh0ZW5kaW5nIGRyaXZlciBkb2Vzbid0IHV0aWxpemVcbiAgICAvLyB0aGUgc2V0dGluZ3MgZnVuY3Rpb25hbGl0eSBpdHNlbGZcbiAgICB0aGlzLnNldHRpbmdzID0gbmV3IERldmljZVNldHRpbmdzKHt9LCBfLm5vb3ApO1xuXG4gICAgdGhpcy5yZXNldE9uVW5leHBlY3RlZFNodXRkb3duKCk7XG5cbiAgICAvLyBrZWVwaW5nIHRyYWNrIG9mIGluaXRpYWwgb3B0c1xuICAgIHRoaXMuaW5pdGlhbE9wdHMgPSBfLmNsb25lRGVlcCh0aGlzLm9wdHMpO1xuXG4gICAgLy8gYWxsb3cgc3ViY2xhc3NlcyB0byBoYXZlIGludGVybmFsIGRyaXZlcnNcbiAgICB0aGlzLm1hbmFnZWREcml2ZXJzID0gW107XG5cbiAgICAvLyBzdG9yZSBldmVudCB0aW1pbmdzXG4gICAgdGhpcy5fZXZlbnRIaXN0b3J5ID0ge1xuICAgICAgY29tbWFuZHM6IFtdIC8vIGNvbW1hbmRzIGdldCBhIHNwZWNpYWwgcGxhY2VcbiAgICB9O1xuXG4gICAgLy8gY2FjaGUgdGhlIGltYWdlIGVsZW1lbnRzXG4gICAgdGhpcy5faW1nRWxDYWNoZSA9IG1ha2VJbWFnZUVsZW1lbnRDYWNoZSgpO1xuXG4gICAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBwcm9wZXJ0eSBpcyB1c2VkIGJ5IEFwcGl1bURyaXZlciB0byBzdG9yZSB0aGUgZGF0YSBvZiB0aGVcbiAgICogc3BlY2lmaWMgZHJpdmVyIHNlc3Npb25zLiBUaGlzIGRhdGEgY2FuIGJlIGxhdGVyIHVzZWQgdG8gYWRqdXN0XG4gICAqIHByb3BlcnRpZXMgZm9yIGRyaXZlciBpbnN0YW5jZXMgcnVubmluZyBpbiBwYXJhbGxlbC5cbiAgICogT3ZlcnJpZGUgaXQgaW4gaW5oZXJpdGVkIGRyaXZlciBjbGFzc2VzIGlmIG5lY2Vzc2FyeS5cbiAgICpcbiAgICogQHJldHVybiB7b2JqZWN0fSBEcml2ZXIgcHJvcGVydGllcyBtYXBwaW5nXG4gICAqL1xuICBnZXQgZHJpdmVyRGF0YSAoKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgcHJvcGVydHkgY29udHJvbHMgdGhlIHdheSB7I2V4ZWN1dGVDb21tYW5kfSBtZXRob2RcbiAgICogaGFuZGxlcyBuZXcgZHJpdmVyIGNvbW1hbmRzIHJlY2VpdmVkIGZyb20gdGhlIGNsaWVudC5cbiAgICogT3ZlcnJpZGUgaXQgZm9yIGluaGVyaXRlZCBjbGFzc2VzIG9ubHkgaW4gc3BlY2lhbCBjYXNlcy5cbiAgICpcbiAgICogQHJldHVybiB7Ym9vbGVhbn0gSWYgdGhlIHJldHVybmVkIHZhbHVlIGlzIHRydWUgKGRlZmF1bHQpIHRoZW4gYWxsIHRoZSBjb21tYW5kc1xuICAgKiAgIHJlY2VpdmVkIGJ5IHRoZSBwYXJ0aWN1bGFyIGRyaXZlciBpbnN0YW5jZSBhcmUgZ29pbmcgdG8gYmUgcHV0IGludG8gdGhlIHF1ZXVlLFxuICAgKiAgIHNvIGVhY2ggZm9sbG93aW5nIGNvbW1hbmQgd2lsbCBub3QgYmUgZXhlY3V0ZWQgdW50aWwgdGhlIHByZXZpb3VzIGNvbW1hbmRcbiAgICogICBleGVjdXRpb24gaXMgY29tcGxldGVkLiBGYWxzZSB2YWx1ZSBkaXNhYmxlcyB0aGF0IHF1ZXVlLCBzbyBlYWNoIGRyaXZlciBjb21tYW5kXG4gICAqICAgaXMgZXhlY3V0ZWQgaW5kZXBlbmRlbnRseSBhbmQgZG9lcyBub3Qgd2FpdCBmb3IgYW55dGhpbmcuXG4gICAqL1xuICBnZXQgaXNDb21tYW5kc1F1ZXVlRW5hYmxlZCAoKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKlxuICAgKiBtYWtlIGV2ZW50SGlzdG9yeSBhIHByb3BlcnR5IGFuZCByZXR1cm4gYSBjbG9uZWQgb2JqZWN0IHNvIGEgY29uc3VtZXIgY2FuJ3RcbiAgICogaW5hZHZlcnRlbnRseSBjaGFuZ2UgZGF0YSBvdXRzaWRlIG9mIGxvZ0V2ZW50XG4gICAqL1xuICBnZXQgZXZlbnRIaXN0b3J5ICgpIHtcbiAgICByZXR1cm4gXy5jbG9uZURlZXAodGhpcy5fZXZlbnRIaXN0b3J5KTtcbiAgfVxuXG4gIC8qXG4gICAqIEFQSSBtZXRob2QgZm9yIGRyaXZlciBkZXZlbG9wZXJzIHRvIGxvZyB0aW1pbmdzIGZvciBpbXBvcnRhbnQgZXZlbnRzXG4gICAqL1xuICBsb2dFdmVudCAoZXZlbnROYW1lKSB7XG4gICAgaWYgKGV2ZW50TmFtZSA9PT0gJ2NvbW1hbmRzJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgbG9nIGNvbW1hbmRzIGRpcmVjdGx5Jyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZXZlbnROYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGV2ZW50TmFtZSAke2V2ZW50TmFtZX1gKTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9ldmVudEhpc3RvcnlbZXZlbnROYW1lXSkge1xuICAgICAgdGhpcy5fZXZlbnRIaXN0b3J5W2V2ZW50TmFtZV0gPSBbXTtcbiAgICB9XG4gICAgbGV0IHRzID0gRGF0ZS5ub3coKTtcbiAgICBsZXQgbG9nVGltZSA9IChuZXcgRGF0ZSh0cykpLnRvVGltZVN0cmluZygpO1xuICAgIHRoaXMuX2V2ZW50SGlzdG9yeVtldmVudE5hbWVdLnB1c2godHMpO1xuICAgIGxvZy5kZWJ1ZyhgRXZlbnQgJyR7ZXZlbnROYW1lfScgbG9nZ2VkIGF0ICR7dHN9ICgke2xvZ1RpbWV9KWApO1xuICB9XG5cbiAgLypcbiAgICogT3ZlcnJpZGRlbiBpbiBhcHBpdW0gZHJpdmVyLCBidXQgaGVyZSBzbyB0aGF0IGluZGl2aWR1YWwgZHJpdmVycyBjYW4gYmVcbiAgICogdGVzdGVkIHdpdGggY2xpZW50cyB0aGF0IHBvbGxcbiAgICovXG4gIGFzeW5jIGdldFN0YXR1cyAoKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgcmVxdWlyZS1hd2FpdFxuICAgIHJldHVybiB7fTtcbiAgfVxuXG4gIC8qXG4gICAqIEluaXRpYWxpemUgYSBuZXcgb25VbmV4cGVjdGVkU2h1dGRvd24gcHJvbWlzZSwgY2FuY2VsbGluZyBleGlzdGluZyBvbmUuXG4gICAqL1xuICByZXNldE9uVW5leHBlY3RlZFNodXRkb3duICgpIHtcbiAgICBpZiAodGhpcy5vblVuZXhwZWN0ZWRTaHV0ZG93biAmJiAhdGhpcy5vblVuZXhwZWN0ZWRTaHV0ZG93bi5pc0Z1bGZpbGxlZCgpKSB7XG4gICAgICB0aGlzLm9uVW5leHBlY3RlZFNodXRkb3duLmNhbmNlbCgpO1xuICAgIH1cbiAgICB0aGlzLm9uVW5leHBlY3RlZFNodXRkb3duID0gbmV3IEIoKHJlc29sdmUsIHJlamVjdCwgb25DYW5jZWwpID0+IHtcbiAgICAgIG9uQ2FuY2VsKCgpID0+IHJlamVjdChuZXcgQi5DYW5jZWxsYXRpb25FcnJvcigpKSk7XG4gICAgICB0aGlzLnVuZXhwZWN0ZWRTaHV0ZG93bkRlZmVycmVkID0ge3Jlc29sdmUsIHJlamVjdH07XG4gICAgfSk7XG4gICAgLy8gbm9vcCBoYW5kbGVyIHRvIGF2b2lkIHdhcm5pbmcuXG4gICAgdGhpcy5vblVuZXhwZWN0ZWRTaHV0ZG93bi5jYXRjaCgoKSA9PiB7fSk7XG4gIH1cblxuICAvLyB3ZSBvbmx5IHdhbnQgc3ViY2xhc3NlcyB0byBldmVyIGV4dGVuZCB0aGUgY29udHJhaW50c1xuICBzZXQgZGVzaXJlZENhcENvbnN0cmFpbnRzIChjb25zdHJhaW50cykge1xuICAgIHRoaXMuX2NvbnN0cmFpbnRzID0gT2JqZWN0LmFzc2lnbih0aGlzLl9jb25zdHJhaW50cywgY29uc3RyYWludHMpO1xuICAgIC8vICdwcmVzZW5jZScgbWVhbnMgZGlmZmVyZW50IHRoaW5ncyBpbiBkaWZmZXJlbnQgdmVyc2lvbnMgb2YgdGhlIHZhbGlkYXRvcixcbiAgICAvLyB3aGVuIHdlIHNheSAndHJ1ZScgd2UgbWVhbiB0aGF0IGl0IHNob3VsZCBub3QgYmUgYWJsZSB0byBiZSBlbXB0eVxuICAgIGZvciAoY29uc3QgWywgdmFsdWVdIG9mIF8udG9QYWlycyh0aGlzLl9jb25zdHJhaW50cykpIHtcbiAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5wcmVzZW5jZSA9PT0gdHJ1ZSkge1xuICAgICAgICB2YWx1ZS5wcmVzZW5jZSA9IHtcbiAgICAgICAgICBhbGxvd0VtcHR5OiBmYWxzZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgZGVzaXJlZENhcENvbnN0cmFpbnRzICgpIHtcbiAgICByZXR1cm4gdGhpcy5fY29uc3RyYWludHM7XG4gIH1cblxuICAvLyBtZXRob2QgcmVxdWlyZWQgYnkgTUpTT05XUCBpbiBvcmRlciB0byBkZXRlcm1pbmUgd2hldGhlciBpdCBzaG91bGRcbiAgLy8gcmVzcG9uZCB3aXRoIGFuIGludmFsaWQgc2Vzc2lvbiByZXNwb25zZVxuICBzZXNzaW9uRXhpc3RzIChzZXNzaW9uSWQpIHtcbiAgICBpZiAoIXNlc3Npb25JZCkgcmV0dXJuIGZhbHNlOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGN1cmx5XG4gICAgcmV0dXJuIHNlc3Npb25JZCA9PT0gdGhpcy5zZXNzaW9uSWQ7XG4gIH1cblxuICAvLyBtZXRob2QgcmVxdWlyZWQgYnkgTUpTT05XUCBpbiBvcmRlciB0byBkZXRlcm1pbmUgaWYgdGhlIGNvbW1hbmQgc2hvdWxkXG4gIC8vIGJlIHByb3hpZWQgZGlyZWN0bHkgdG8gdGhlIGRyaXZlclxuICBkcml2ZXJGb3JTZXNzaW9uICgvKnNlc3Npb25JZCovKSB7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsb2dFeHRyYUNhcHMgKGNhcHMpIHtcbiAgICBsZXQgZXh0cmFDYXBzID0gXy5kaWZmZXJlbmNlKF8ua2V5cyhjYXBzKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8ua2V5cyh0aGlzLl9jb25zdHJhaW50cykpO1xuICAgIGlmIChleHRyYUNhcHMubGVuZ3RoKSB7XG4gICAgICBsb2cud2FybihgVGhlIGZvbGxvd2luZyBjYXBhYmlsaXRpZXMgd2VyZSBwcm92aWRlZCwgYnV0IGFyZSBub3QgYCArXG4gICAgICAgICAgICAgICBgcmVjb2duaXplZCBieSBBcHBpdW06YCk7XG4gICAgICBmb3IgKGNvbnN0IGNhcCBvZiBleHRyYUNhcHMpIHtcbiAgICAgICAgbG9nLndhcm4oYCAgJHtjYXB9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFsaWRhdGVEZXNpcmVkQ2FwcyAoY2Fwcykge1xuICAgIGlmICghdGhpcy5zaG91bGRWYWxpZGF0ZUNhcHMpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0ZUNhcHMoY2FwcywgdGhpcy5fY29uc3RyYWludHMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZy5lcnJvckFuZFRocm93KG5ldyBlcnJvcnMuU2Vzc2lvbk5vdENyZWF0ZWRFcnJvcihgVGhlIGRlc2lyZWRDYXBhYmlsaXRpZXMgb2JqZWN0IHdhcyBub3QgdmFsaWQgZm9yIHRoZSBgICtcbiAgICAgICAgICAgICAgICAgICAgYGZvbGxvd2luZyByZWFzb24ocyk6ICR7ZS5tZXNzYWdlfWApKTtcbiAgICB9XG5cbiAgICB0aGlzLmxvZ0V4dHJhQ2FwcyhjYXBzKTtcblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaXNNanNvbndwUHJvdG9jb2wgKCkge1xuICAgIHJldHVybiB0aGlzLnByb3RvY29sID09PSBQUk9UT0NPTFMuTUpTT05XUDtcbiAgfVxuXG4gIGlzVzNDUHJvdG9jb2wgKCkge1xuICAgIHJldHVybiB0aGlzLnByb3RvY29sID09PSBQUk9UT0NPTFMuVzNDO1xuICB9XG5cbiAgc2V0UHJvdG9jb2xNSlNPTldQICgpIHtcbiAgICB0aGlzLnByb3RvY29sID0gUFJPVE9DT0xTLk1KU09OV1A7XG4gIH1cblxuICBzZXRQcm90b2NvbFczQyAoKSB7XG4gICAgdGhpcy5wcm90b2NvbCA9IFBST1RPQ09MUy5XM0M7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgd2hldGhlciBhIGdpdmVuIGZlYXR1cmUgaXMgZW5hYmxlZCB2aWEgaXRzIG5hbWVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBuYW1lIG9mIGZlYXR1cmUvY29tbWFuZFxuICAgKlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICovXG4gIGlzRmVhdHVyZUVuYWJsZWQgKG5hbWUpIHtcbiAgICAvLyBpZiB3ZSBoYXZlIGV4cGxpY2l0bHkgZGVuaWVkIHRoaXMgZmVhdHVyZSwgcmV0dXJuIGZhbHNlIGltbWVkaWF0ZWx5XG4gICAgaWYgKHRoaXMuZGVueUluc2VjdXJlICYmIF8uaW5jbHVkZXModGhpcy5kZW55SW5zZWN1cmUsIG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gaWYgd2Ugc3BlY2lmaWNhbGx5IGhhdmUgYWxsb3dlZCB0aGUgZmVhdHVyZSwgcmV0dXJuIHRydWVcbiAgICBpZiAodGhpcy5hbGxvd0luc2VjdXJlICYmIF8uaW5jbHVkZXModGhpcy5hbGxvd0luc2VjdXJlLCBuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gb3RoZXJ3aXNlLCBpZiB3ZSd2ZSBnbG9iYWxseSBhbGxvd2VkIGluc2VjdXJlIGZlYXR1cmVzIGFuZCBub3QgZGVuaWVkXG4gICAgLy8gdGhpcyBvbmUsIHJldHVybiB0cnVlXG4gICAgaWYgKHRoaXMucmVsYXhlZFNlY3VyaXR5RW5hYmxlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gaWYgd2UgaGF2ZW4ndCBhbGxvd2VkIGFueXRoaW5nIGluc2VjdXJlLCB0aGVuIHJlamVjdFxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBc3NlcnQgdGhhdCBhIGdpdmVuIGZlYXR1cmUgaXMgZW5hYmxlZCBhbmQgdGhyb3cgYSBoZWxwZnVsIGVycm9yIGlmIGl0J3NcbiAgICogbm90XG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gbmFtZSBvZiBmZWF0dXJlL2NvbW1hbmRcbiAgICovXG4gIGVuc3VyZUZlYXR1cmVFbmFibGVkIChuYW1lKSB7XG4gICAgaWYgKCF0aGlzLmlzRmVhdHVyZUVuYWJsZWQobmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUG90ZW50aWFsbHkgaW5zZWN1cmUgZmVhdHVyZSAnJHtuYW1lfScgaGFzIG5vdCBiZWVuIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBlbmFibGVkLiBJZiB5b3Ugd2FudCB0byBlbmFibGUgdGhpcyBmZWF0dXJlIGFuZCBhY2NlcHQgYCArXG4gICAgICAgICAgICAgICAgICAgICAgYHRoZSBzZWN1cml0eSByYW1pZmljYXRpb25zLCBwbGVhc2UgZG8gc28gYnkgZm9sbG93aW5nIGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGB0aGUgZG9jdW1lbnRlZCBpbnN0cnVjdGlvbnMgYXQgaHR0cHM6Ly9naXRodWIuY29tL2FwcGl1bWAgK1xuICAgICAgICAgICAgICAgICAgICAgIGAvYXBwaXVtL2Jsb2IvbWFzdGVyL2RvY3MvZW4vd3JpdGluZy1ydW5uaW5nLWFwcGl1bS9zZWN1cml0eS5tZGApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRoaXMgaXMgdGhlIG1haW4gY29tbWFuZCBoYW5kbGVyIGZvciB0aGUgZHJpdmVyLiBJdCB3cmFwcyBjb21tYW5kXG4gIC8vIGV4ZWN1dGlvbiB3aXRoIHRpbWVvdXQgbG9naWMsIGNoZWNraW5nIHRoYXQgd2UgaGF2ZSBhIHZhbGlkIHNlc3Npb24sXG4gIC8vIGFuZCBlbnN1cmluZyB0aGF0IHdlIGV4ZWN1dGUgY29tbWFuZHMgb25lIGF0IGEgdGltZS4gVGhpcyBtZXRob2QgaXMgY2FsbGVkXG4gIC8vIGJ5IE1KU09OV1AncyBleHByZXNzIHJvdXRlci5cbiAgYXN5bmMgZXhlY3V0ZUNvbW1hbmQgKGNtZCwgLi4uYXJncykge1xuICAgIC8vIGdldCBzdGFydCB0aW1lIGZvciB0aGlzIGNvbW1hbmQsIGFuZCBsb2cgaW4gc3BlY2lhbCBjYXNlc1xuICAgIGxldCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGlmIChjbWQgPT09ICdjcmVhdGVTZXNzaW9uJykge1xuICAgICAgLy8gSWYgY3JlYXRpbmcgYSBzZXNzaW9uIGRldGVybWluZSBpZiBXM0Mgb3IgTUpTT05XUCBwcm90b2NvbCB3YXMgcmVxdWVzdGVkIGFuZCByZW1lbWJlciB0aGUgY2hvaWNlXG4gICAgICB0aGlzLnByb3RvY29sID0gZGV0ZXJtaW5lUHJvdG9jb2woLi4uYXJncyk7XG4gICAgICB0aGlzLmxvZ0V2ZW50KEVWRU5UX1NFU1NJT05fSU5JVCk7XG4gICAgfSBlbHNlIGlmIChjbWQgPT09ICdkZWxldGVTZXNzaW9uJykge1xuICAgICAgdGhpcy5sb2dFdmVudChFVkVOVF9TRVNTSU9OX1FVSVRfU1RBUlQpO1xuICAgIH1cblxuICAgIC8vIGlmIHdlIGhhZCBhIGNvbW1hbmQgdGltZXIgcnVubmluZywgY2xlYXIgaXQgbm93IHRoYXQgd2UncmUgc3RhcnRpbmdcbiAgICAvLyBhIG5ldyBjb21tYW5kIGFuZCBzbyBkb24ndCB3YW50IHRvIHRpbWUgb3V0XG4gICAgdGhpcy5jbGVhck5ld0NvbW1hbmRUaW1lb3V0KCk7XG5cbiAgICAvLyBJZiB3ZSBkb24ndCBoYXZlIHRoaXMgY29tbWFuZCwgaXQgbXVzdCBub3QgYmUgaW1wbGVtZW50ZWRcbiAgICAvLyBJZiB0aGUgdGFyZ2V0IGVsZW1lbnQgaXMgSW1hZ2VFbGVtZW50LCB3ZSBtdXN0IHRyeSB0byBjYWxsIGBJbWFnZUVsZW1lbnQuZXhlY3V0ZWAgd2hpY2ggZXhpc3QgZm9sbG93aW5nIGxpbmVzXG4gICAgLy8gc2luY2UgSW1hZ2VFbGVtZW50IHN1cHBvcnRzIGZldyBjb21tYW5kcyBieSBpdHNlbGZcbiAgICBjb25zdCBpbWdFbElkID0gZ2V0SW1nRWxGcm9tQXJncyhhcmdzKTtcbiAgICBpZiAoIXRoaXNbY21kXSAmJiAhaW1nRWxJZCkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5Ob3RZZXRJbXBsZW1lbnRlZEVycm9yKCk7XG4gICAgfVxuXG4gICAgbGV0IHJlcztcbiAgICBpZiAodGhpcy5pc0NvbW1hbmRzUXVldWVFbmFibGVkICYmIGNtZCAhPT0gJ2V4ZWN1dGVEcml2ZXJTY3JpcHQnKSB7XG4gICAgICAvLyBXaGF0IHdlJ3JlIGRvaW5nIGhlcmUgaXMgcHJldHR5IGNsZXZlci4gdGhpcy5jdXJDb21tYW5kIGlzIGFsd2F5c1xuICAgICAgLy8gYSBwcm9taXNlIHJlcHJlc2VudGluZyB0aGUgY29tbWFuZCBjdXJyZW50bHkgYmVpbmcgZXhlY3V0ZWQgYnkgdGhlXG4gICAgICAvLyBkcml2ZXIsIG9yIHRoZSBsYXN0IGNvbW1hbmQgZXhlY3V0ZWQgYnkgdGhlIGRyaXZlciAoaXQgc3RhcnRzIG9mZiBhc1xuICAgICAgLy8gZXNzZW50aWFsbHkgYSBwcmUtcmVzb2x2ZWQgcHJvbWlzZSkuIFdoZW4gYSBjb21tYW5kIGNvbWVzIGluLCB3ZSB0YWNrIGl0XG4gICAgICAvLyB0byB0aGUgZW5kIG9mIHRoaXMuY3VyQ29tbWFuZCwgZXNzZW50aWFsbHkgc2F5aW5nIHdlIHdhbnQgdG8gZXhlY3V0ZSBpdFxuICAgICAgLy8gd2hlbmV2ZXIgdGhpcy5jdXJDb21tYW5kIGlzIGRvbmUuIFdlIGNhbGwgdGhpcyBuZXcgcHJvbWlzZSBuZXh0Q29tbWFuZCxcbiAgICAgIC8vIGFuZCBpdHMgcmVzb2x1dGlvbiBpcyB3aGF0IHdlIHVsdGltYXRlbHkgd2lsbCByZXR1cm4gdG8gd2hvbWV2ZXIgY2FsbGVkXG4gICAgICAvLyB1cy4gTWVhbndoaWxlLCB3ZSByZXNldCB0aGlzLmN1ckNvbW1hbmQgdG8gX2JlXyBuZXh0Q29tbWFuZCAoYnV0XG4gICAgICAvLyBpZ25vcmluZyBhbnkgcmVqZWN0aW9ucyksIHNvIHRoYXQgaWYgYW5vdGhlciBjb21tYW5kIGNvbWVzIGludG8gdGhlXG4gICAgICAvLyBzZXJ2ZXIsIGl0IGdldHMgdGFja2VkIG9uIHRvIHRoZSBlbmQgb2YgbmV4dENvbW1hbmQuIFRodXMgd2UgY3JlYXRlXG4gICAgICAvLyBhIGNoYWluIG9mIHByb21pc2VzIHRoYXQgYWN0cyBhcyBhIHF1ZXVlIHdpdGggc2luZ2xlIGNvbmN1cnJlbmN5LlxuICAgICAgY29uc3QgbmV4dENvbW1hbmQgPSB0aGlzLmN1ckNvbW1hbmQudGhlbigoKSA9PiB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgcHJvbWlzZS9wcmVmZXItYXdhaXQtdG8tdGhlblxuICAgICAgICAvLyBpZiB3ZSB1bmV4cGVjdGVkbHkgc2h1dCBkb3duLCB3ZSBuZWVkIHRvIHJlamVjdCBldmVyeSBjb21tYW5kIGluXG4gICAgICAgIC8vIHRoZSBxdWV1ZSBiZWZvcmUgd2UgYWN0dWFsbHkgdHJ5IHRvIHJ1biBpdFxuICAgICAgICBpZiAodGhpcy5zaHV0ZG93blVuZXhwZWN0ZWRseSkge1xuICAgICAgICAgIHJldHVybiBCLnJlamVjdChuZXcgZXJyb3JzLk5vU3VjaERyaXZlckVycm9yKCdUaGUgZHJpdmVyIHdhcyB1bmV4cGVjdGVkbHkgc2h1dCBkb3duIScpKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBhbHNvIG5lZWQgdG8gdHVybiB0aGUgY29tbWFuZCBpbnRvIGEgY2FuY2VsbGFibGUgcHJvbWlzZSBzbyBpZiB3ZVxuICAgICAgICAvLyBoYXZlIGFuIHVuZXhwZWN0ZWQgc2h1dGRvd24gZXZlbnQsIGZvciBleGFtcGxlLCB3ZSBjYW4gY2FuY2VsIGl0IGZyb21cbiAgICAgICAgLy8gb3V0c2lkZSwgcmVqZWN0aW5nIHRoZSBjdXJyZW50IGNvbW1hbmQgaW1tZWRpYXRlbHlcbiAgICAgICAgbGV0IHJlamVjdDtcbiAgICAgICAgdGhpcy5jdXJDb21tYW5kQ2FuY2VsbGFibGUgPSBCLnJlc29sdmUoKS50aGVuKCgpID0+IHsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBwcm9taXNlL3ByZWZlci1hd2FpdC10by10aGVuXG4gICAgICAgICAgLy8gaW4gb3JkZXIgdG8gYWJvcnQgdGhlIHByb21pc2UsIHdlIG5lZWQgdG8gaGF2ZSBpdCBpbiBhIHJhY2VcbiAgICAgICAgICAvLyB3aXRoIG9uZSB3ZSBjYW4gcmVqZWN0IGZyb20gb3V0c2lkZVxuICAgICAgICAgIGNvbnN0IGNhbmNlbFByb21pc2UgPSBuZXcgQihmdW5jdGlvbiAoXywgX3JlamVjdCkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVudXNlZC12YXJzXG4gICAgICAgICAgICByZWplY3QgPSBfcmVqZWN0O1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gaWYgb25lIG9mIHRoZSBhcmdzIGlzIGFuIGltYWdlIGVsZW1lbnQsIGhhbmRsZSBpdCBzZXBhcmF0ZWx5XG4gICAgICAgICAgcmV0dXJuIEIucmFjZShbXG4gICAgICAgICAgICBpbWdFbElkID8gSW1hZ2VFbGVtZW50LmV4ZWN1dGUodGhpcywgY21kLCBpbWdFbElkLCAuLi5hcmdzKSA6IHRoaXNbY21kXSguLi5hcmdzKSxcbiAgICAgICAgICAgIGNhbmNlbFByb21pc2UsXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBvdmVycmlkZSB0aGUgQiNjYW5jZWwgZnVuY3Rpb24sIHdoaWNoIGp1c3QgdHVybnMgb2ZmIGxpc3RlbmVyc1xuICAgICAgICB0aGlzLmN1ckNvbW1hbmRDYW5jZWxsYWJsZS5jYW5jZWwgPSBmdW5jdGlvbiBjYW5jZWwgKGVycikge1xuICAgICAgICAgIGlmIChyZWplY3QpIHtcbiAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY3VyQ29tbWFuZENhbmNlbGxhYmxlO1xuICAgICAgfSk7XG4gICAgICB0aGlzLmN1ckNvbW1hbmQgPSBuZXh0Q29tbWFuZC5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICByZXMgPSBhd2FpdCBuZXh0Q29tbWFuZDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSWYgd2UndmUgZ290dGVuIGhlcmUgYmVjYXVzZSB3ZSdyZSBydW5uaW5nIGV4ZWN1dGVEcml2ZXJTY3JpcHQsIHdlXG4gICAgICAvLyBuZXZlciB3YW50IHRvIGFkZCB0aGUgY29tbWFuZCB0byB0aGUgcXVldWUuIFRoaXMgaXMgYmVjYXVzZSBpdCBydW5zXG4gICAgICAvLyBvdGhlciBjb21tYW5kcyBfaW5zaWRlXyBpdCwgc28gdGhvc2UgY29tbWFuZHMgd291bGQgbmV2ZXIgc3RhcnQgaWYgd2VcbiAgICAgIC8vIHdlcmUgd2FpdGluZyBmb3IgZXhlY3V0ZURyaXZlclNjcmlwdCB0byBmaW5pc2guIFNvIGl0IGlzIGEgc3BlY2lhbFxuICAgICAgLy8gY2FzZS5cbiAgICAgIGlmICh0aGlzLnNodXRkb3duVW5leHBlY3RlZGx5KSB7XG4gICAgICAgIHRocm93IG5ldyBlcnJvcnMuTm9TdWNoRHJpdmVyRXJyb3IoJ1RoZSBkcml2ZXIgd2FzIHVuZXhwZWN0ZWRseSBzaHV0IGRvd24hJyk7XG4gICAgICB9XG4gICAgICByZXMgPSBhd2FpdCB0aGlzW2NtZF0oLi4uYXJncyk7XG4gICAgfVxuXG4gICAgLy8gaWYgd2UgaGF2ZSBzZXQgYSBuZXcgY29tbWFuZCB0aW1lb3V0ICh3aGljaCBpcyB0aGUgZGVmYXVsdCksIHN0YXJ0IGFcbiAgICAvLyB0aW1lciBvbmNlIHdlJ3ZlIGZpbmlzaGVkIGV4ZWN1dGluZyB0aGlzIGNvbW1hbmQuIElmIHdlIGRvbid0IGNsZWFyXG4gICAgLy8gdGhlIHRpbWVyICh3aGljaCBpcyBkb25lIHdoZW4gYSBuZXcgY29tbWFuZCBjb21lcyBpbiksIHdlIHdpbGwgdHJpZ2dlclxuICAgIC8vIGF1dG9tYXRpYyBzZXNzaW9uIGRlbGV0aW9uIGluIHRoaXMub25Db21tYW5kVGltZW91dC4gT2YgY291cnNlIHdlIGRvbid0XG4gICAgLy8gd2FudCB0byB0cmlnZ2VyIHRoZSB0aW1lciB3aGVuIHRoZSB1c2VyIGlzIHNodXR0aW5nIGRvd24gdGhlIHNlc3Npb25cbiAgICAvLyBpbnRlbnRpb25hbGx5XG4gICAgaWYgKHRoaXMuaXNDb21tYW5kc1F1ZXVlRW5hYmxlZCAmJiBjbWQgIT09ICdkZWxldGVTZXNzaW9uJykge1xuICAgICAgLy8gcmVzZXRpbmcgZXhpc3RpbmcgdGltZW91dFxuICAgICAgdGhpcy5zdGFydE5ld0NvbW1hbmRUaW1lb3V0KCk7XG4gICAgfVxuXG4gICAgLy8gbG9nIHRpbWluZyBpbmZvcm1hdGlvbiBhYm91dCB0aGlzIGNvbW1hbmRcbiAgICBjb25zdCBlbmRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICB0aGlzLl9ldmVudEhpc3RvcnkuY29tbWFuZHMucHVzaCh7Y21kLCBzdGFydFRpbWUsIGVuZFRpbWV9KTtcbiAgICBpZiAoY21kID09PSAnY3JlYXRlU2Vzc2lvbicpIHtcbiAgICAgIHRoaXMubG9nRXZlbnQoRVZFTlRfU0VTU0lPTl9TVEFSVCk7XG4gICAgfSBlbHNlIGlmIChjbWQgPT09ICdkZWxldGVTZXNzaW9uJykge1xuICAgICAgdGhpcy5sb2dFdmVudChFVkVOVF9TRVNTSU9OX1FVSVRfRE9ORSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcztcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0VW5leHBlY3RlZFNodXRkb3duIChlcnIgPSBuZXcgZXJyb3JzLk5vU3VjaERyaXZlckVycm9yKCdUaGUgZHJpdmVyIHdhcyB1bmV4cGVjdGVkbHkgc2h1dCBkb3duIScpKSB7XG4gICAgdGhpcy51bmV4cGVjdGVkU2h1dGRvd25EZWZlcnJlZC5yZWplY3QoZXJyKTsgLy8gYWxsb3cgb3RoZXJzIHRvIGxpc3RlbiBmb3IgdGhpc1xuICAgIHRoaXMuc2h1dGRvd25VbmV4cGVjdGVkbHkgPSB0cnVlO1xuICAgIGF3YWl0IHRoaXMuZGVsZXRlU2Vzc2lvbih0aGlzLnNlc3Npb25JZCk7XG4gICAgdGhpcy5zaHV0ZG93blVuZXhwZWN0ZWRseSA9IGZhbHNlO1xuICAgIHRoaXMuY3VyQ29tbWFuZENhbmNlbGxhYmxlLmNhbmNlbChlcnIpO1xuICB9XG5cbiAgdmFsaWRhdGVMb2NhdG9yU3RyYXRlZ3kgKHN0cmF0ZWd5LCB3ZWJDb250ZXh0ID0gZmFsc2UpIHtcbiAgICBsZXQgdmFsaWRTdHJhdGVnaWVzID0gdGhpcy5sb2NhdG9yU3RyYXRlZ2llcztcbiAgICBsb2cuZGVidWcoYFZhbGlkIGxvY2F0b3Igc3RyYXRlZ2llcyBmb3IgdGhpcyByZXF1ZXN0OiAke3ZhbGlkU3RyYXRlZ2llcy5qb2luKCcsICcpfWApO1xuXG4gICAgaWYgKHdlYkNvbnRleHQpIHtcbiAgICAgIHZhbGlkU3RyYXRlZ2llcyA9IHZhbGlkU3RyYXRlZ2llcy5jb25jYXQodGhpcy53ZWJMb2NhdG9yU3RyYXRlZ2llcyk7XG4gICAgfVxuXG4gICAgaWYgKCFfLmluY2x1ZGVzKHZhbGlkU3RyYXRlZ2llcywgc3RyYXRlZ3kpKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRTZWxlY3RvckVycm9yKGBMb2NhdG9yIFN0cmF0ZWd5ICcke3N0cmF0ZWd5fScgaXMgbm90IHN1cHBvcnRlZCBmb3IgdGhpcyBzZXNzaW9uYCk7XG4gICAgfVxuICB9XG5cbiAgLypcbiAgICogUmVzdGFydCB0aGUgc2Vzc2lvbiB3aXRoIHRoZSBvcmlnaW5hbCBjYXBzLFxuICAgKiBwcmVzZXJ2aW5nIHRoZSB0aW1lb3V0IGNvbmZpZy5cbiAgICovXG4gIGFzeW5jIHJlc2V0ICgpIHtcbiAgICBsb2cuZGVidWcoJ1Jlc2V0dGluZyBhcHAgbWlkLXNlc3Npb24nKTtcbiAgICBsb2cuZGVidWcoJ1J1bm5pbmcgZ2VuZXJpYyBmdWxsIHJlc2V0Jyk7XG5cbiAgICAvLyBwcmVzZXJ2aW5nIHN0YXRlXG4gICAgbGV0IGN1cnJlbnRDb25maWcgPSB7fTtcbiAgICBmb3IgKGxldCBwcm9wZXJ0eSBvZiBbJ2ltcGxpY2l0V2FpdE1zJywgJ25ld0NvbW1hbmRUaW1lb3V0TXMnLCAnc2Vzc2lvbklkJywgJ3Jlc2V0T25VbmV4cGVjdGVkU2h1dGRvd24nXSkge1xuICAgICAgY3VycmVudENvbmZpZ1twcm9wZXJ0eV0gPSB0aGlzW3Byb3BlcnR5XTtcbiAgICB9XG5cbiAgICAvLyBXZSBhbHNvIG5lZWQgdG8gcHJlc2VydmUgdGhlIHVuZXhwZWN0ZWQgc2h1dGRvd24sIGFuZCBtYWtlIHN1cmUgaXQgaXMgbm90IGNhbmNlbGxlZCBkdXJpbmcgcmVzZXQuXG4gICAgdGhpcy5yZXNldE9uVW5leHBlY3RlZFNodXRkb3duID0gKCkgPT4ge307XG5cbiAgICAvLyBDb25zdHJ1Y3QgdGhlIGFyZ3VtZW50cyBmb3IgY3JlYXRlU2Vzc2lvbiBkZXBlbmRpbmcgb24gdGhlIHByb3RvY29sIHR5cGVcbiAgICBjb25zdCBhcmdzID0gdGhpcy5wcm90b2NvbCA9PT0gUFJPVE9DT0xTLlczQyA/XG4gICAgICBbdW5kZWZpbmVkLCB1bmRlZmluZWQsIHthbHdheXNNYXRjaDogdGhpcy5jYXBzLCBmaXJzdE1hdGNoOiBbe31dfV0gOlxuICAgICAgW3RoaXMuY2Fwc107XG5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5kZWxldGVTZXNzaW9uKHRoaXMuc2Vzc2lvbklkKTtcbiAgICAgIGxvZy5kZWJ1ZygnUmVzdGFydGluZyBhcHAnKTtcbiAgICAgIGF3YWl0IHRoaXMuY3JlYXRlU2Vzc2lvbiguLi5hcmdzKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgLy8gYWx3YXlzIHJlc3RvcmUgc3RhdGUuXG4gICAgICBmb3IgKGxldCBba2V5LCB2YWx1ZV0gb2YgXy50b1BhaXJzKGN1cnJlbnRDb25maWcpKSB7XG4gICAgICAgIHRoaXNba2V5XSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmNsZWFyTmV3Q29tbWFuZFRpbWVvdXQoKTtcbiAgfVxuXG4gIGFzeW5jIGdldFN3aXBlT3B0aW9ucyAoZ2VzdHVyZXMsIHRvdWNoQ291bnQgPSAxKSB7XG4gICAgbGV0IHN0YXJ0WCA9IHRoaXMuaGVscGVycy5nZXRDb29yZERlZmF1bHQoZ2VzdHVyZXNbMF0ub3B0aW9ucy54KSxcbiAgICAgICAgc3RhcnRZID0gdGhpcy5oZWxwZXJzLmdldENvb3JkRGVmYXVsdChnZXN0dXJlc1swXS5vcHRpb25zLnkpLFxuICAgICAgICBlbmRYID0gdGhpcy5oZWxwZXJzLmdldENvb3JkRGVmYXVsdChnZXN0dXJlc1syXS5vcHRpb25zLngpLFxuICAgICAgICBlbmRZID0gdGhpcy5oZWxwZXJzLmdldENvb3JkRGVmYXVsdChnZXN0dXJlc1syXS5vcHRpb25zLnkpLFxuICAgICAgICBkdXJhdGlvbiA9IHRoaXMuaGVscGVycy5nZXRTd2lwZVRvdWNoRHVyYXRpb24oZ2VzdHVyZXNbMV0pLFxuICAgICAgICBlbGVtZW50ID0gZ2VzdHVyZXNbMF0ub3B0aW9ucy5lbGVtZW50LFxuICAgICAgICBkZXN0RWxlbWVudCA9IGdlc3R1cmVzWzJdLm9wdGlvbnMuZWxlbWVudCB8fCBnZXN0dXJlc1swXS5vcHRpb25zLmVsZW1lbnQ7XG5cbiAgICAvLyB0aGVyZSdzIG5vIGRlc3RpbmF0aW9uIGVsZW1lbnQgaGFuZGxpbmcgaW4gYm9vdHN0cmFwIGFuZCBzaW5jZSBpdCBhcHBsaWVzIHRvIGFsbCBwbGF0Zm9ybXMsIHdlIGhhbmRsZSBpdCBoZXJlXG4gICAgaWYgKHV0aWwuaGFzVmFsdWUoZGVzdEVsZW1lbnQpKSB7XG4gICAgICBsZXQgbG9jUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRMb2NhdGlvbkluVmlldyhkZXN0RWxlbWVudCk7XG4gICAgICBsZXQgc2l6ZVJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0U2l6ZShkZXN0RWxlbWVudCk7XG4gICAgICBsZXQgb2Zmc2V0WCA9IChNYXRoLmFicyhlbmRYKSA8IDEgJiYgTWF0aC5hYnMoZW5kWCkgPiAwKSA/IHNpemVSZXN1bHQud2lkdGggKiBlbmRYIDogZW5kWDtcbiAgICAgIGxldCBvZmZzZXRZID0gKE1hdGguYWJzKGVuZFkpIDwgMSAmJiBNYXRoLmFicyhlbmRZKSA+IDApID8gc2l6ZVJlc3VsdC5oZWlnaHQgKiBlbmRZIDogZW5kWTtcbiAgICAgIGVuZFggPSBsb2NSZXN1bHQueCArIG9mZnNldFg7XG4gICAgICBlbmRZID0gbG9jUmVzdWx0LnkgKyBvZmZzZXRZO1xuICAgICAgLy8gaWYgdGhlIHRhcmdldCBlbGVtZW50IHdhcyBwcm92aWRlZCwgdGhlIGNvb3JkaW5hdGVzIGZvciB0aGUgZGVzdGluYXRpb24gbmVlZCB0byBiZSByZWxhdGl2ZSB0byBpdC5cbiAgICAgIGlmICh1dGlsLmhhc1ZhbHVlKGVsZW1lbnQpKSB7XG4gICAgICAgIGxldCBmaXJzdEVsTG9jYXRpb24gPSBhd2FpdCB0aGlzLmdldExvY2F0aW9uSW5WaWV3KGVsZW1lbnQpO1xuICAgICAgICBlbmRYIC09IGZpcnN0RWxMb2NhdGlvbi54O1xuICAgICAgICBlbmRZIC09IGZpcnN0RWxMb2NhdGlvbi55O1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBjbGllbnRzIGFyZSByZXNwb25zaWJsZSB0byB1c2UgdGhlc2Ugb3B0aW9ucyBjb3JyZWN0bHlcbiAgICByZXR1cm4ge3N0YXJ0WCwgc3RhcnRZLCBlbmRYLCBlbmRZLCBkdXJhdGlvbiwgdG91Y2hDb3VudCwgZWxlbWVudH07XG4gIH1cblxuICBwcm94eUFjdGl2ZSAoLyogc2Vzc2lvbklkICovKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgZ2V0UHJveHlBdm9pZExpc3QgKC8qIHNlc3Npb25JZCAqLykge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGNhblByb3h5ICgvKiBzZXNzaW9uSWQgKi8pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogV2hldGhlciBhIGdpdmVuIGNvbW1hbmQgcm91dGUgKGV4cHJlc3NlZCBhcyBtZXRob2QgYW5kIHVybCkgc2hvdWxkIG5vdCBiZVxuICAgKiBwcm94aWVkIGFjY29yZGluZyB0byB0aGlzIGRyaXZlclxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gc2Vzc2lvbklkIC0gdGhlIGN1cnJlbnQgc2Vzc2lvbklkIChpbiBjYXNlIHRoZSBkcml2ZXIgcnVuc1xuICAgKiBtdWx0aXBsZSBzZXNzaW9uIGlkcyBhbmQgcmVxdWlyZXMgaXQpLiBUaGlzIGlzIG5vdCB1c2VkIGluIHRoaXMgbWV0aG9kIGJ1dFxuICAgKiBzaG91bGQgYmUgbWFkZSBhdmFpbGFibGUgdG8gb3ZlcnJpZGRlbiBtZXRob2RzLlxuICAgKiBAcGFyYW0ge3N0cmluZ30gbWV0aG9kIC0gSFRUUCBtZXRob2Qgb2YgdGhlIHJvdXRlXG4gICAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgLSB1cmwgb2YgdGhlIHJvdXRlXG4gICAqXG4gICAqIEByZXR1cm5zIHtib29sZWFufSAtIHdoZXRoZXIgdGhlIHJvdXRlIHNob3VsZCBiZSBhdm9pZGVkXG4gICAqL1xuICBwcm94eVJvdXRlSXNBdm9pZGVkIChzZXNzaW9uSWQsIG1ldGhvZCwgdXJsKSB7XG4gICAgZm9yIChsZXQgYXZvaWRTY2hlbWEgb2YgdGhpcy5nZXRQcm94eUF2b2lkTGlzdChzZXNzaW9uSWQpKSB7XG4gICAgICBpZiAoIV8uaXNBcnJheShhdm9pZFNjaGVtYSkgfHwgYXZvaWRTY2hlbWEubGVuZ3RoICE9PSAyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUHJveHkgYXZvaWRhbmNlIG11c3QgYmUgYSBsaXN0IG9mIHBhaXJzJyk7XG4gICAgICB9XG4gICAgICBsZXQgW2F2b2lkTWV0aG9kLCBhdm9pZFBhdGhSZWdleF0gPSBhdm9pZFNjaGVtYTtcbiAgICAgIGlmICghXy5pbmNsdWRlcyhbJ0dFVCcsICdQT1NUJywgJ0RFTEVURSddLCBhdm9pZE1ldGhvZCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnJlY29nbml6ZWQgcHJveHkgYXZvaWRhbmNlIG1ldGhvZCAnJHthdm9pZE1ldGhvZH0nYCk7XG4gICAgICB9XG4gICAgICBpZiAoIV8uaXNSZWdFeHAoYXZvaWRQYXRoUmVnZXgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUHJveHkgYXZvaWRhbmNlIHBhdGggbXVzdCBiZSBhIHJlZ3VsYXIgZXhwcmVzc2lvbicpO1xuICAgICAgfVxuICAgICAgbGV0IG5vcm1hbGl6ZWRVcmwgPSB1cmwucmVwbGFjZShuZXcgUmVnRXhwKGBeJHtfLmVzY2FwZVJlZ0V4cCh0aGlzLmJhc2VQYXRoKX1gKSwgJycpO1xuICAgICAgaWYgKGF2b2lkTWV0aG9kID09PSBtZXRob2QgJiYgYXZvaWRQYXRoUmVnZXgudGVzdChub3JtYWxpemVkVXJsKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYWRkTWFuYWdlZERyaXZlciAoZHJpdmVyKSB7XG4gICAgdGhpcy5tYW5hZ2VkRHJpdmVycy5wdXNoKGRyaXZlcik7XG4gIH1cblxuICBnZXRNYW5hZ2VkRHJpdmVycyAoKSB7XG4gICAgcmV0dXJuIHRoaXMubWFuYWdlZERyaXZlcnM7XG4gIH1cblxuICByZWdpc3RlckltYWdlRWxlbWVudCAoaW1nRWwpIHtcbiAgICB0aGlzLl9pbWdFbENhY2hlLnNldChpbWdFbC5pZCwgaW1nRWwpO1xuICAgIGNvbnN0IHByb3RvS2V5ID0gdGhpcy5pc1czQ1Byb3RvY29sKCkgPyBXM0NfRUxFTUVOVF9LRVkgOiBNSlNPTldQX0VMRU1FTlRfS0VZO1xuICAgIHJldHVybiBpbWdFbC5hc0VsZW1lbnQocHJvdG9LZXkpO1xuICB9XG59XG5cbmZvciAobGV0IFtjbWQsIGZuXSBvZiBfLnRvUGFpcnMoY29tbWFuZHMpKSB7XG4gIEJhc2VEcml2ZXIucHJvdG90eXBlW2NtZF0gPSBmbjtcbn1cblxuZXhwb3J0IHsgQmFzZURyaXZlciB9O1xuZXhwb3J0IGRlZmF1bHQgQmFzZURyaXZlcjtcbiJdLCJmaWxlIjoibGliL2Jhc2Vkcml2ZXIvZHJpdmVyLmpzIiwic291cmNlUm9vdCI6Ii4uLy4uLy4uIn0=
