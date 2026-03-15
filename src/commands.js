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
exports.parseCommand = parseCommand;
exports.resolveLoadedInput = resolveLoadedInput;
exports.saveHistory = saveHistory;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var context_js_1 = require("./context.js");
function parseCommand(input, context) {
    var trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
        return { type: 'noop' };
    }
    var _a = trimmed.split(/\s+/), command = _a[0], rest = _a.slice(1);
    var arg = rest.join(' ');
    switch (command) {
        case '/codex':
            return { type: 'mode', mode: 'codex', message: 'Mode set to codex.' };
        case '/opus':
            return { type: 'mode', mode: 'opus', message: 'Mode set to opus.' };
        case '/both':
            return { type: 'mode', mode: 'both', message: 'Mode set to both.' };
        case '/load':
            if (!arg) {
                return { type: 'info', message: 'Usage: /load <path>' };
            }
            return { type: 'input', content: "@load ".concat(arg), display: arg };
        case '/context':
            if (arg === 'reload') {
                return { type: 'context-reload' };
            }
            return { type: 'info', message: (0, context_js_1.previewContext)(context.context) };
        case '/clear':
            return { type: 'clear' };
        case '/save':
            return { type: 'save', path: arg || undefined };
        case '/models':
            return {
                type: 'info',
                message: "Codex: ".concat(context.codexModel, "\nOpus: ").concat(context.opusModel),
            };
        case '/help':
            return {
                type: 'info',
                message: [
                    '/codex        Switch to CODEX mode',
                    '/opus         Switch to OPUS mode',
                    '/both         Switch to BOTH mode',
                    '/load <path>  Load a file and send it as the next user message',
                    '/context      Show the loaded context',
                    '/context reload  Reload context.md from disk',
                    '/clear        Clear conversation history',
                    '/save [path]  Save the session to markdown',
                    '/models       Show model names',
                    '/help         Show all commands',
                    '/exit or /q   Exit the REPL',
                ].join('\n'),
            };
        case '/exit':
        case '/q':
            return { type: 'exit' };
        default:
            return { type: 'info', message: "Unknown command: ".concat(command) };
    }
}
function resolveLoadedInput(cwd, relativePath) {
    return __awaiter(this, void 0, void 0, function () {
        var absolutePath;
        return __generator(this, function (_a) {
            absolutePath = node_path_1.default.resolve(cwd, relativePath);
            return [2 /*return*/, (0, promises_1.readFile)(absolutePath, 'utf8')];
        });
    });
}
function saveHistory(history, cwd, targetPath) {
    return __awaiter(this, void 0, void 0, function () {
        var timestamp, resolvedPath, content;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    timestamp = new Date().toISOString().replaceAll(':', '-');
                    resolvedPath = node_path_1.default.resolve(cwd, targetPath !== null && targetPath !== void 0 ? targetPath : "critique-session-".concat(timestamp, ".md"));
                    content = history
                        .getEntries()
                        .map(function (entry) {
                        var label = entry.author === 'you' ? 'You' : entry.author === 'codex' ? 'Codex' : 'Opus';
                        return "## ".concat(label, "\n\n_").concat(entry.timestamp, "_\n\n").concat(entry.content, "\n");
                    })
                        .join('\n');
                    return [4 /*yield*/, (0, promises_1.writeFile)(resolvedPath, content, 'utf8')];
                case 1:
                    _a.sent();
                    history.markSaved();
                    return [2 /*return*/, resolvedPath];
            }
        });
    });
}
