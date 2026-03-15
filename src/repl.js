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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRepl = startRepl;
var node_readline_1 = require("node:readline");
var node_process_1 = require("node:process");
var context_js_1 = require("./context.js");
var commands_js_1 = require("./commands.js");
var history_js_1 = require("./history.js");
var renderer_js_1 = require("./renderer.js");
function question(rl, prompt) {
    return new Promise(function (resolve) { return rl.question(prompt, resolve); });
}
function startRepl(params) {
    return __awaiter(this, void 0, void 0, function () {
        function runTurn(message, currentMode) {
            return __awaiter(this, void 0, void 0, function () {
                var codexText, opusText;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            history.addUserMessage(message);
                            if (!(currentMode === 'codex' || currentMode === 'both')) return [3 /*break*/, 2];
                            return [4 /*yield*/, streamModel('codex', params.codex)];
                        case 1:
                            codexText = _a.sent();
                            if (codexText === null) {
                                renderer.separator();
                                return [2 /*return*/];
                            }
                            history.addAssistantMessage('codex', codexText);
                            _a.label = 2;
                        case 2:
                            if (!(currentMode === 'opus' || currentMode === 'both')) return [3 /*break*/, 4];
                            return [4 /*yield*/, streamModel('opus', params.opus)];
                        case 3:
                            opusText = _a.sent();
                            if (opusText === null) {
                                renderer.separator();
                                return [2 /*return*/];
                            }
                            history.addAssistantMessage('opus', opusText);
                            _a.label = 4;
                        case 4:
                            renderer.separator();
                            return [2 /*return*/];
                    }
                });
            });
        }
        function streamModel(label, client) {
            return __awaiter(this, void 0, void 0, function () {
                var result, error_3;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            renderer.print('');
                            renderer.print(renderer.modelHeader(label));
                            abortController = new AbortController();
                            state = 'streaming';
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, 4, 5]);
                            return [4 /*yield*/, client.streamResponse({
                                    history: history.getEntries(),
                                    context: context.content,
                                    signal: abortController.signal,
                                    write: function (chunk) { return renderer.write(chunk); },
                                })];
                        case 2:
                            result = _a.sent();
                            renderer.print('');
                            if (result.cancelled) {
                                renderer.info('[cancelled]');
                                return [2 /*return*/, null];
                            }
                            return [2 /*return*/, result.text.trimEnd()];
                        case 3:
                            error_3 = _a.sent();
                            if (error_3 instanceof Error && error_3.message.startsWith("".concat(label === 'codex' ? 'Codex' : 'Opus', " error:"))) {
                                if (error_3.message.includes('429')) {
                                    renderer.error("".concat(error_3.message, " \u2014 retrying in 5s failed"));
                                }
                                else {
                                    renderer.error(error_3.message);
                                }
                            }
                            else {
                                renderer.error("".concat(label === 'codex' ? 'Codex' : 'Opus', " error: ").concat(error_3 instanceof Error ? error_3.message : String(error_3)));
                            }
                            return [2 /*return*/, null];
                        case 4:
                            abortController = null;
                            state = 'prompt';
                            return [7 /*endfinally*/];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        }
        var renderer, history, context, mode, state, abortController, exiting, rl, confirm, saveIfRequested, handleExit, rawInput, input, command, answer, savedPath, error_1, loaded, error_2;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    renderer = new renderer_js_1.Renderer();
                    history = new history_js_1.ConversationHistory();
                    return [4 /*yield*/, (0, context_js_1.loadContext)(params.resolver)];
                case 1:
                    context = _a.sent();
                    mode = 'both';
                    state = 'prompt';
                    abortController = null;
                    exiting = false;
                    rl = node_readline_1.default.createInterface({
                        input: node_process_1.default.stdin,
                        output: node_process_1.default.stdout,
                        terminal: node_process_1.default.stdin.isTTY,
                    });
                    confirm = function (prompt) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    state = 'confirming';
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, , 3, 4]);
                                    return [4 /*yield*/, question(rl, prompt)];
                                case 2: return [2 /*return*/, (_a.sent()).trim()];
                                case 3:
                                    state = 'prompt';
                                    return [7 /*endfinally*/];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); };
                    saveIfRequested = function () { return __awaiter(_this, void 0, void 0, function () {
                        var answer, savedPath, error_4;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!history.hasUnsavedChanges()) {
                                        return [2 /*return*/, true];
                                    }
                                    return [4 /*yield*/, confirm("Session has ".concat(history.count(), " turns. Save before exiting? [y/n/path] "))];
                                case 1:
                                    answer = _a.sent();
                                    if (!answer || answer.toLowerCase() === 'n') {
                                        return [2 /*return*/, true];
                                    }
                                    _a.label = 2;
                                case 2:
                                    _a.trys.push([2, 4, , 5]);
                                    return [4 /*yield*/, (0, commands_js_1.saveHistory)(history, params.cwd, answer.toLowerCase() === 'y' ? undefined : answer)];
                                case 3:
                                    savedPath = _a.sent();
                                    renderer.info("Saved session to ".concat(savedPath));
                                    return [2 /*return*/, true];
                                case 4:
                                    error_4 = _a.sent();
                                    renderer.error("Failed to save session: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                                    return [2 /*return*/, false];
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); };
                    handleExit = function () { return __awaiter(_this, void 0, void 0, function () {
                        var okayToExit;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (exiting) {
                                        return [2 /*return*/];
                                    }
                                    exiting = true;
                                    return [4 /*yield*/, saveIfRequested()];
                                case 1:
                                    okayToExit = _a.sent();
                                    if (!okayToExit) {
                                        exiting = false;
                                        return [2 /*return*/];
                                    }
                                    rl.close();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    rl.on('SIGINT', function () {
                        if (state === 'streaming') {
                            abortController === null || abortController === void 0 ? void 0 : abortController.abort();
                            return;
                        }
                        void handleExit();
                    });
                    rl.on('close', function () {
                        node_process_1.default.stdout.write('\n');
                        node_process_1.default.exit(0);
                    });
                    renderer.banner(context.path, params.codex.model, params.opus.model, mode);
                    _a.label = 2;
                case 2:
                    if (!true) return [3 /*break*/, 22];
                    state = 'prompt';
                    return [4 /*yield*/, question(rl, renderer.promptLabel(mode))];
                case 3:
                    rawInput = _a.sent();
                    input = rawInput.trim();
                    if (!input) {
                        return [3 /*break*/, 2];
                    }
                    command = (0, commands_js_1.parseCommand)(input, {
                        cwd: params.cwd,
                        mode: mode,
                        context: context,
                        historyLength: history.count(),
                        codexModel: params.codex.model,
                        opusModel: params.opus.model,
                    });
                    if (!(command.type !== 'noop')) return [3 /*break*/, 20];
                    if (command.type === 'mode') {
                        mode = command.mode;
                        renderer.info(command.message);
                        return [3 /*break*/, 2];
                    }
                    if (command.type === 'info') {
                        renderer.info(command.message);
                        return [3 /*break*/, 2];
                    }
                    if (!(command.type === 'context-reload')) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, context_js_1.loadContext)(params.resolver)];
                case 4:
                    context = _a.sent();
                    renderer.info(context.path ? "Context reloaded: ".concat(context.path) : 'No context loaded.');
                    return [3 /*break*/, 2];
                case 5:
                    if (!(command.type === 'clear')) return [3 /*break*/, 7];
                    return [4 /*yield*/, confirm('Clear history? [y/n] ')];
                case 6:
                    answer = _a.sent();
                    if (answer.toLowerCase() === 'y') {
                        history.clear();
                        renderer.info('History cleared.');
                    }
                    return [3 /*break*/, 2];
                case 7:
                    if (!(command.type === 'save')) return [3 /*break*/, 12];
                    _a.label = 8;
                case 8:
                    _a.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, (0, commands_js_1.saveHistory)(history, params.cwd, command.path)];
                case 9:
                    savedPath = _a.sent();
                    renderer.info("Saved session to ".concat(savedPath));
                    return [3 /*break*/, 11];
                case 10:
                    error_1 = _a.sent();
                    renderer.error("Failed to save session: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                    return [3 /*break*/, 11];
                case 11: return [3 /*break*/, 2];
                case 12:
                    if (!(command.type === 'exit')) return [3 /*break*/, 14];
                    return [4 /*yield*/, handleExit()];
                case 13:
                    _a.sent();
                    return [2 /*return*/];
                case 14:
                    if (!(command.type === 'input')) return [3 /*break*/, 20];
                    _a.label = 15;
                case 15:
                    _a.trys.push([15, 18, , 19]);
                    return [4 /*yield*/, (0, commands_js_1.resolveLoadedInput)(params.cwd, command.display)];
                case 16:
                    loaded = _a.sent();
                    return [4 /*yield*/, runTurn(loaded, mode)];
                case 17:
                    _a.sent();
                    return [3 /*break*/, 19];
                case 18:
                    error_2 = _a.sent();
                    renderer.error("Failed to load file: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    return [3 /*break*/, 19];
                case 19: return [3 /*break*/, 2];
                case 20: return [4 /*yield*/, runTurn(rawInput, mode)];
                case 21:
                    _a.sent();
                    return [3 /*break*/, 2];
                case 22: return [2 /*return*/];
            }
        });
    });
}
