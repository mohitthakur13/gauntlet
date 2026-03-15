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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpusClient = void 0;
var node_process_1 = require("node:process");
var sdk_1 = require("@anthropic-ai/sdk");
var history_js_1 = require("../history.js");
var SYSTEM_SUFFIX = 'You are a senior architect reviewing code and design. Be direct, specific, and critical. Flag problems by severity: HIGH / MED / LOW.';
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
        var stream, text, _a, stream_1, stream_1_1, chunk, e_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    stream = params.client.messages.stream({
                        model: 'claude-opus-4-5',
                        max_tokens: 4096,
                        system: buildSystemPrompt(params.context),
                        messages: params.history.map(function (entry) { return ({
                            role: entry.role,
                            content: (0, history_js_1.formatEntryForModel)(entry),
                        }); }),
                    }, { signal: params.signal });
                    text = '';
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _e.label = 2;
                case 2: return [4 /*yield*/, stream_1.next()];
                case 3:
                    if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = stream_1_1.value;
                    _a = false;
                    chunk = _d;
                    if (chunk.type !== 'content_block_delta' || chunk.delta.type !== 'text_delta') {
                        return [3 /*break*/, 4];
                    }
                    text += chunk.delta.text;
                    params.write(chunk.delta.text);
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(stream_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12: return [2 /*return*/, { text: text, cancelled: false, skipped: false }];
            }
        });
    });
}
var OpusClient = /** @class */ (function () {
    function OpusClient() {
        this.model = 'claude-opus-4-5';
        var apiKey = node_process_1.default.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            this.client = null;
            this.initError = 'Opus error: missing ANTHROPIC_API_KEY';
            return;
        }
        this.client = new sdk_1.default({ apiKey: apiKey });
        this.initError = null;
    }
    OpusClient.prototype.streamResponse = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.client) {
                            throw new Error((_a = this.initError) !== null && _a !== void 0 ? _a : 'Opus error: client unavailable');
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, streamOnce({
                                client: this.client,
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
                        throw new Error("Opus error: ".concat(getErrorMessage(error_1)));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return OpusClient;
}());
exports.OpusClient = OpusClient;
