/// <reference path="chrome/DebuggerWebAudio.js" />
/// <reference path="utils/Types.js" />
/// <reference path="WebAudioEventObserver.js" />

import {ChromeDebuggerWebAudio} from './chrome/DebuggerWebAudio';
import {Observer} from './utils/Observer';

/**
 * Collect WebAudio debugger events into per context graphs.
 * @extends {Observer<Audion.GraphContext>}
 * @memberof Audion
 * @alias WebAudioGraphIntegrator
 */
export class WebAudioGraphIntegrator extends Observer {
  /**
   * Create a WebAudioGraphIntegrator.
   * @param {Audion.WebAudioEventObserver} webAudioEvents
   */
  constructor(webAudioEvents) {
    /**
     * @type {Object<string, Audion.GraphContext>}
     */
    const contexts = {};
    super((onNext, ...args) => {
      return webAudioEvents.observe((message) => {
        switch (message.method) {
          case ChromeDebuggerWebAudio.Events.audioNodeCreated:
            {
              const audioNodeCreated =
                /** @type {ChromeDebuggerWebAudio.AudioNodeCreatedEvent} */ (
                  message.params
                );
              contexts[audioNodeCreated.node.contextId].nodes[
                audioNodeCreated.node.nodeId
              ] = {node: audioNodeCreated.node, edges: []};
              onNext(contexts[audioNodeCreated.node.contextId]);
            }
            break;
          case ChromeDebuggerWebAudio.Events.audioNodeWillBeDestroyed:
            {
              const audioNodeDestroyed = /**
               * @type {ChromeDebuggerWebAudio.AudioNodeWillBeDestroyedEvent}
               */ (message.params);
              delete contexts[audioNodeDestroyed.contextId].nodes[
                audioNodeDestroyed.nodeId
              ];
              onNext(contexts[audioNodeDestroyed.contextId]);
            }
            break;
          case ChromeDebuggerWebAudio.Events.contextChanged:
            {
              const contextChanged =
                /** @type {ChromeDebuggerWebAudio.ContextChangedEvent} */ (
                  message.params
                );
              contexts[contextChanged.context.contextId].context =
                contextChanged.context;
              onNext(contexts[contextChanged.context.contextId]);
            }
            break;
          case ChromeDebuggerWebAudio.Events.contextCreated:
            {
              const contextCreated =
                /** @type {ChromeDebuggerWebAudio.ContextCreatedEvent} */ (
                  message.params
                );
              contexts[contextCreated.context.contextId] = {
                id: contextCreated.context.contextId,
                context: contextCreated.context,
                nodes: {},
              };
              onNext(contexts[contextCreated.context.contextId]);
            }
            break;
          case ChromeDebuggerWebAudio.Events.contextWillBeDestroyed:
            {
              const contextDestroyed = /**
               * @type {ChromeDebuggerWebAudio.ContextWillBeDestroyedEvent}
               */ (message.params);
              delete contexts[contextDestroyed.contextId];
              onNext({
                id: contextDestroyed.contextId,
                context: null,
                nodes: null,
              });
            }
            break;
          case ChromeDebuggerWebAudio.Events.nodesConnected:
            {
              const nodesConnected =
                /** @type {ChromeDebuggerWebAudio.NodesConnectedEvent} */ (
                  message.params
                );
              contexts[nodesConnected.contextId].nodes[
                nodesConnected.sourceId
              ].edges.push(nodesConnected);
              onNext(contexts[nodesConnected.contextId]);
            }
            break;
          case ChromeDebuggerWebAudio.Events.nodesDisconnected:
            {
              const nodesDisconnected =
                /** @type {ChromeDebuggerWebAudio.NodesDisconnectedEvent} */ (
                  message.params
                );
              const {edges} =
                contexts[nodesDisconnected.contextId].nodes[
                  nodesDisconnected.sourceId
                ];
              edges.splice(
                edges.findIndex(
                  (edge) =>
                    edge.destinationId === nodesDisconnected.destinationId &&
                    edge.sourceOutputIndex ===
                      nodesDisconnected.sourceOutputIndex &&
                    edge.destinationInputIndex ===
                      nodesDisconnected.destinationInputIndex,
                ),
              );
              onNext(contexts[nodesDisconnected.contextId]);
            }
            break;
        }
      }, ...args);
    });
  }
}
