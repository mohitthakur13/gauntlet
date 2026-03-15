"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Renderer = void 0;
var node_process_1 = require("node:process");
var ANSI = {
    reset: '\u001b[0m',
    dim: '\u001b[2m',
    red: '\u001b[31m',
    yellow: '\u001b[33m',
    cyan: '\u001b[36m',
    purple: '\u001b[35m',
    white: '\u001b[37m',
};
var Renderer = /** @class */ (function () {
    function Renderer() {
        this.useColor = node_process_1.default.stdout.isTTY;
    }
    Renderer.prototype.color = function (text, color) {
        if (!this.useColor) {
            return text;
        }
        return "".concat(ANSI[color]).concat(text).concat(ANSI.reset);
    };
    Renderer.prototype.print = function (text) {
        if (text === void 0) { text = ''; }
        node_process_1.default.stdout.write("".concat(text, "\n"));
    };
    Renderer.prototype.write = function (text) {
        node_process_1.default.stdout.write(text);
    };
    Renderer.prototype.banner = function (contextPath, codexModel, opusModel, mode) {
        this.print('┌─────────────────────────────────────────┐');
        this.print('│  critique                    ctrl+c/q   │');
        this.print('└─────────────────────────────────────────┘');
        this.print("Context: ".concat(contextPath !== null && contextPath !== void 0 ? contextPath : 'none'));
        this.print("Models:  Codex (".concat(codexModel, ")  \u00B7  Opus (").concat(opusModel, ")"));
        this.print("Mode:    ".concat(mode));
        this.separator();
    };
    Renderer.prototype.separator = function () {
        this.print(this.color('──────────────────────────────────────────', 'dim'));
    };
    Renderer.prototype.promptLabel = function (mode) {
        return "[".concat(mode, "] You: ");
    };
    Renderer.prototype.modelHeader = function (model) {
        var label = model === 'codex' ? this.color('Codex', 'cyan') : this.color('Opus', 'purple');
        var line = model === 'codex'
            ? '──────────────────────────────────────'
            : '───────────────────────────────────────';
        return "".concat(label, " ").concat(this.color(line, 'dim'));
    };
    Renderer.prototype.info = function (message) {
        this.print(this.color(message, 'yellow'));
    };
    Renderer.prototype.error = function (message) {
        this.print(this.color(message, 'red'));
    };
    return Renderer;
}());
exports.Renderer = Renderer;
