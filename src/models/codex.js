"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexClient = void 0;
var node_process_1 = require("node:process");
var openai_1 = require("openai");
var history_js_1 = require("../history.js");
var SYSTEM_SUFFIX = 'You are a senior software engineer. Respond with precise, implementable answers.';
function buildSystemPrompt(context) {
    return context ? "".concat(context, "\n\n").concat(SYSTEM_SUFFIX) : SYSTEM_SUFFIX;
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function streamOnce(params) {
    return __awaiter(this, void 0, void 0, function () {
        var stream, text, _a, stream_1, stream_1_1, chunk, delta, e_1_1;
        var _b, e_1, _c, _d;
        var _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, params.client.chat.completions.create({
                        model: params.model,
                        stream: true,
                        messages: __spreadArray([
                            { role: 'system', content: buildSystemPrompt(params.context) }
                        ], params.history.map(function (entry) { return ({
                            role: entry.role,
                            content: (0, history_js_1.formatEntryForModel)(entry),
                        }); }), true),
                    }, { signal: params.signal })];
                case 1:
                    stream = _h.sent();
                    text = '';
                    _h.label = 2;
                case 2:
                    _h.trys.push([2, 7, 8, 13]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _h.label = 3;
                case 3: return [4 /*yield*/, stream_1.next()];
                case 4:
                    if (!(stream_1_1 = _h.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 6];
                    _d = stream_1_1.value;
                    _a = false;
                    chunk = _d;
                    delta = (_g = (_f = (_e = chunk.choices[0]) === null || _e === void 0 ? void 0 : _e.delta) === null || _f === void 0 ? void 0 : _f.content) !== null && _g !== void 0 ? _g : '';
                    if (!delta) {
                        return [3 /*break*/, 5];
                    }
                    text += delta;
                    params.write(delta);
                    _h.label = 5;
                case 5:
                    _a = true;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 13];
                case 7:
                    e_1_1 = _h.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 13];
                case 8:
                    _h.trys.push([8, , 11, 12]);
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 10];
                    return [4 /*yield*/, _c.call(stream_1)];
                case 9:
                    _h.sent();
                    _h.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 12: return [7 /*endfinally*/];
                case 13: return [2 /*return*/, { text: text, cancelled: false, skipped: false }];
            }
        });
    });
}
var CodexClient = /** @class */ (function () {
    function CodexClient() {
        var _a;
        this.model = (_a = node_process_1.default.env.CODEX_MODEL) !== null && _a !== void 0 ? _a : 'o3';
        var apiKey = node_process_1.default.env.OPENAI_API_KEY;
        if (!apiKey) {
            this.client = null;
            this.initError = 'Codex error: missing OPENAI_API_KEY';
            return;
        }
        this.client = new openai_1.default({ apiKey: apiKey });
        this.initError = null;
    }
    CodexClient.prototype.streamResponse = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1, status_1, retryError_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.client) {
                            throw new Error((_a = this.initError) !== null && _a !== void 0 ? _a : 'Codex error: client unavailable');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 9]);
                        return [4 /*yield*/, streamOnce({
                                client: this.client,
                                model: this.model,
                                history: input.history,
                                context: input.context,
                                signal: input.signal,
                                write: input.write,
                            })];
                    case 2: return [2 /*return*/, _b.sent()];
                    case 3:
                        error_1 = _b.sent();
                        if (isAbortError(error_1)) {
                            return [2 /*return*/, { text: '', cancelled: true, skipped: false }];
                        }
                        status_1 = typeof error_1 === 'object' && error_1 !== null && 'status' in error_1 ? error_1.status : undefined;
                        if (!(status_1 === 429)) return [3 /*break*/, 8];
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _b.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, streamOnce({
                                client: this.client,
                                model: this.model,
                                history: input.history,
                                context: input.context,
                                signal: input.signal,
                                write: input.write,
                            })];
                    case 6: return [2 /*return*/, _b.sent()];
                    case 7:
                        retryError_1 = _b.sent();
                        if (isAbortError(retryError_1)) {
                            return [2 /*return*/, { text: '', cancelled: true, skipped: false }];
                        }
                        throw retryError_1;
                    case 8: throw new Error("Codex error: ".concat(getErrorMessage(error_1)));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return CodexClient;
}());
exports.CodexClient = CodexClient;
