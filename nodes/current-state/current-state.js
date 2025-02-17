const RenderTemplate = require('../../lib/mustache-context');
const BaseNode = require('../../lib/base-node');
const Joi = require('@hapi/joi');

module.exports = function(RED) {
    const nodeOptions = {
        config: {
            halt_if: {},
            halt_if_type: nodeDef => nodeDef.halt_if_type || 'str',
            halt_if_compare: nodeDef => nodeDef.halt_if_compare || 'is',
            override_topic: {},
            entity_id: {},
            state_type: nodeDef => nodeDef.state_type || 'str',
            state_location: nodeDef => nodeDef.state_location || 'payload',
            // state location type
            override_payload: nodeDef => {
                if (nodeDef.state_location === undefined) {
                    return nodeDef.override_payload !== false ? 'msg' : 'none';
                }
                return nodeDef.override_payload;
            },
            entity_location: nodeDef => nodeDef.entity_location || 'data',
            // entity location type
            override_data: nodeDef => {
                if (nodeDef.entity_location === undefined) {
                    return nodeDef.override_data !== false ? 'msg' : 'none';
                }
                return nodeDef.override_data;
            },
            blockInputOverrides: {}
        },
        input: {
            entity_id: {
                messageProp: 'payload.entity_id',
                configProp: 'entity_id',
                validation: {
                    haltOnFail: true,
                    schema: Joi.string().label('entity_id')
                }
            }
        }
    };

    class CurrentStateNode extends BaseNode {
        constructor(nodeDefinition) {
            super(nodeDefinition, RED, nodeOptions);
        }

        /* eslint-disable camelcase */
        async onInput({ parsedMessage, message }) {
            const config = this.nodeConfig;
            const entityId = RenderTemplate(
                config.blockInputOverrides === true
                    ? config.entity_id
                    : parsedMessage.entity_id.value,
                message,
                this.node.context(),
                this.utils.toCamelCase(config.server.name)
            );

            if (config.server === null) {
                this.node.error('No valid server selected.', message);
                return;
            }

            const entity = this.utils.merge(
                {},
                await config.server.homeAssistant.getStates(entityId)
            );

            if (!entity.entity_id) {
                this.node.error(
                    `Entity could not be found in cache for entity_id: ${entityId}`,
                    message
                );
                return;
            }

            entity.timeSinceChangedMs =
                Date.now() - new Date(entity.last_changed).getTime();

            // Convert and save original state if needed
            if (config.state_type !== 'str') {
                entity.original_state = entity.state;
                entity.state = this.getCastValue(
                    config.state_type,
                    entity.state
                );
            }

            // default switch to true if undefined (backward compatibility)
            message.topic =
                config.override_topic !== false ? entityId : message.topic;

            // Set 'State Location'
            this.setContextValue(
                entity.state,
                config.override_payload,
                config.state_location,
                message
            );

            // Set 'Entity Location'
            this.setContextValue(
                entity,
                config.override_data,
                config.entity_location,
                message
            );

            let isIfState;
            try {
                isIfState = await this.getComparatorResult(
                    config.halt_if_compare,
                    config.halt_if,
                    entity.state,
                    config.halt_if_type,
                    {
                        message,
                        entity
                    }
                );
            } catch (e) {
                this.setStatusFailed('Error');
                this.node.error(e.message, message);
                return;
            }

            // Handle version 0 'halt if' outputs
            if (config.version < 1) {
                if (config.halt_if && isIfState) {
                    this.setStatusFailed(entity.state);
                    this.send([null, message]);
                    return;
                }
                this.setStatusSuccess(entity.state);
                this.send([message, null]);
                return;
            }

            if (config.halt_if && !isIfState) {
                this.setStatusFailed(entity.state);
                this.send([null, message]);
                return;
            }

            this.setStatusSuccess(entity.state);
            this.send([message, null]);
        }
    }

    RED.nodes.registerType('api-current-state', CurrentStateNode);
};
