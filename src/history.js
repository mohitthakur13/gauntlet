"use strict";
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
exports.ConversationHistory = void 0;
exports.formatEntryForModel = formatEntryForModel;
var ConversationHistory = /** @class */ (function () {
    function ConversationHistory() {
        this.entries = [];
        this.dirty = false;
    }
    ConversationHistory.prototype.addUserMessage = function (content) {
        this.entries.push({
            role: 'user',
            content: content,
            author: 'you',
            timestamp: new Date().toISOString(),
        });
        this.dirty = true;
    };
    ConversationHistory.prototype.addAssistantMessage = function (model, content) {
        this.entries.push({
            role: 'assistant',
            content: content,
            author: model,
            timestamp: new Date().toISOString(),
        });
        this.dirty = true;
    };
    ConversationHistory.prototype.clear = function () {
        this.entries = [];
        this.dirty = false;
    };
    ConversationHistory.prototype.markSaved = function () {
        this.dirty = false;
    };
    ConversationHistory.prototype.getEntries = function () {
        return __spreadArray([], this.entries, true);
    };
    ConversationHistory.prototype.hasUnsavedChanges = function () {
        return this.dirty && this.entries.length > 0;
    };
    ConversationHistory.prototype.count = function () {
        return this.entries.length;
    };
    return ConversationHistory;
}());
exports.ConversationHistory = ConversationHistory;
function formatEntryForModel(entry) {
    var label = entry.author === 'you' ? 'You' : entry.author === 'codex' ? 'Codex' : 'Opus';
    return "[".concat(label, "]: ").concat(entry.content);
}
