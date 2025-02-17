const merge = require('lodash.merge');
const BaseNode = require('./base-node');

const DEFAULT_NODE_OPTIONS = {
    debug: false,
    config: {
        name: {},
        server: {
            isNode: true
        }
    }
};

class EventsNode extends BaseNode {
    constructor(nodeDefinition, RED, nodeOptions = {}) {
        nodeOptions = merge({}, DEFAULT_NODE_OPTIONS, nodeOptions);
        super(nodeDefinition, RED, nodeOptions);
        this.listeners = {};

        this.addEventClientListener(
            'ha_client:close',
            this.onHaEventsClose.bind(this)
        );
        this.addEventClientListener(
            'ha_client:open',
            this.onHaEventsOpen.bind(this)
        );
        this.addEventClientListener(
            'ha_client:error',
            this.onHaEventsError.bind(this)
        );
        this.addEventClientListener(
            'ha_client:connecting',
            this.onHaEventsConnecting.bind(this)
        );

        this.updateConnectionStatus();
    }

    addEventClientListener(event, handler) {
        if (this.websocketClient) {
            this.listeners[event] = handler;
            this.websocketClient.addListener(event, handler);
        }
    }

    removeEventClientListeners() {
        if (this.websocketClient) {
            Object.entries(this.listeners).forEach(([event, handler]) => {
                this.websocketClient.removeListener(event, handler);
            });
        }
    }

    onClose(nodeRemoved) {
        this.removeEventClientListeners();
    }

    onHaEventsClose() {
        this.updateConnectionStatus();
    }

    onHaEventsOpen() {
        this.updateConnectionStatus();
    }

    onHaEventsConnecting() {
        this.updateConnectionStatus();
    }

    onHaEventsError(err) {
        if (err.message) this.error(err.message);
    }
}

module.exports = EventsNode;
