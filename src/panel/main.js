/// <reference path="../chrome/DebuggerWebAudioDomain.js" />
/// <reference path="../devtools/Types.js" />

import * as PIXI from 'pixi.js';
import {Application, Graphics} from 'pixi.js';
import {install} from '@pixi/unsafe-eval';

import {chrome} from '../chrome';
import {Observer} from '../utils/Observer';
import {Camera} from './Camera';
import {Color, colorFromNodeType} from './graphStyle';

install(PIXI);

let port;

/** @type {Observer<Audion.GraphContext>} */
const devtoolsObserver = new Observer((onNext, ...args) => {
  port = chrome.runtime.connect();
  port.onMessage.addListener((message) => {
    onNext(message);
  });
  return () => {};
});

const createNodeRenderObserver = Observer.transform(
  devtoolsObserver,
  (message) => {
    if (message.graph) {
      message.graph.nodes.forEach(({v: nodeId, value: node}) => {
        if (node) {
          const nodeRender = createNodeRender(nodeId, message.nodes[nodeId]);
          node.width = nodeRender.size.x;
          node.height = nodeRender.size.y;
        }
      });
    }
    return message;
  },
);

document.getElementById('status').innerText = 'starting';
createNodeRenderObserver.observe((message) => {
  if (message && message.nodes) {
    document.getElementById('status').innerText = `context: ${
      message.id
    } nodes: ${Object.values(message.nodes).length}`;
  }
});

const w = new Worker('panelWorker.js');

const layoutThrottle = Observer.throttle(createNodeRenderObserver, {
  key: (message) => message.id,
});

layoutThrottle.observe((graphContext) => {
  w.postMessage({graphContext});
});

/** @type {Observer<Audion.GraphContext>} */
const layoutObserver = new Observer((onNext) => {
  const onmessage = (message) => onNext(message.data);
  w.addEventListener('message', onmessage);
  return () => {
    w.removeEventListener('message', onmessage);
  };
});

Object.assign(document.body, {width: '100%', height: '100%'});

const graphFlexContainer = document.createElement('div');
Object.assign(graphFlexContainer.style, {
  display: 'flex',
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
document.body.appendChild(graphFlexContainer);

const graphContainer = document.createElement('div');
Object.assign(graphContainer.style, {
  flex: '1 1',
  overflow: 'hidden',
});
graphFlexContainer.appendChild(graphContainer);

const graphLayoutContainer = document.createElement('div');
Object.assign(graphLayoutContainer.style, {
  flex: '0 0 200px',
  width: '200px',
});
graphFlexContainer.appendChild(graphLayoutContainer);

graphLayoutContainer.appendChild(document.getElementById('info'));

/**
 * @param {object} options
 * @param {string} options.label
 * @param {HTMLElement} [options.parent]
 * @param {T[]} [options.choices]
 * @param {T} [options.default]
 * @return {{value: string, observer: Observer<string>}}
 * @template T
 */
function addInput(options) {
  const field = document.createElement('div');
  const label = document.createElement('label');
  let el = /** @type {HTMLElement} */ (document.createElement('input'));
  if (options.choices) {
    el = document.createElement('select');
    options.choices.forEach((choice) => {
      el.appendChild(
        Object.assign(document.createElement('option'), {
          text: choice,
          value: choice,
          selected: options.default === choice,
        }),
      );
    });
  } else {
    Object.assign(el, {value: options.default});
  }
  el.onchange = (e) => {
    o.value = /** @type {HTMLInputElement} */ (e.currentTarget).value;
  };

  label.appendChild(document.createTextNode(`${options.label}: `));
  label.appendChild(el);
  field.appendChild(label);
  (options.parent || graphLayoutContainer).appendChild(field);

  const o = {
    value: options.default,
    observer: new Observer((onNext) => {
      el.onchange = (e) =>
        onNext(
          (o.value = /** @type {HTMLInputElement} */ (e.currentTarget).value),
        );
      return () => {
        el.onchange = (e) => {
          o.value = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        };
      };
    }),
  };
  return o;
}
const rankdirInput = addInput({
  label: 'rankdir',
  choices: ['TB', 'BT', 'LR', 'RL'],
  default: 'LR',
});
const alignInput = addInput({
  label: 'align',
  choices: ['', 'UL', 'UR', 'DL', 'DR'],
});
const rankerInput = addInput({
  label: 'ranker',
  choices: ['network-simplex', 'tight-tree', 'longest-path'],
  default: 'network-simplex',
});
const zoomModeInput = addInput({
  label: 'zoomMode',
  choices: ['fit-to-screen', '1x', 'scroll'],
  default: 'scroll',
});

const layoutOptionsObserver = new Observer((onNext) => {
  let value = {
    rankdir: rankdirInput.value,
    align: alignInput.value,
    ranker: rankerInput.value,
  };
  const unsubscribes = [
    rankdirInput.observer.observe((rankdir) => {
      value = {...value, rankdir};
      onNext(value);
    }),
    alignInput.observer.observe((align) => {
      value = {...value, align};
      onNext(value);
    }),
    rankerInput.observer.observe((ranker) => {
      value = {...value, ranker};
      onNext(value);
    }),
  ];
  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
});

layoutOptionsObserver.observe((layoutOptions) =>
  w.postMessage({layoutOptions}),
);

const app = new Application({
  backgroundColor: 0xffffff,
  resizeTo: graphContainer,
  antialias: true,
});
graphContainer.appendChild(app.view);
window.$app = app;

const g = new Graphics();
app.stage.addChild(g);

const cam = new Camera();

app.stage.interactive = true;
let lastPoint = null;
app.stage.addListener('mousemove', (e) => {
  if (e instanceof PIXI.InteractionEvent) {
    if (lastPoint && e.data.buttons) {
      cam.move(lastPoint.x - e.data.global.x, lastPoint.y - e.data.global.y);
      console.log(
        'mousemove',
        e.data.global.x,
        e.data.global.y,
        e.data.global.x - lastPoint.x,
        e.data.global.y - lastPoint.y,
      );
    }
    lastPoint = e.data.global.clone();
  }
});
app.view.onwheel = (/** @type {WheelEvent} */ e) => {
  cam.zoom(e.deltaY / 1000);
  console.log('wheel', e.deltaY);
};

layoutObserver.observe((message) => {
  cam.setGraphSize(message.graph.value.width, message.graph.value.height);

  if (zoomModeInput.value === 'fit-to-screen') {
    const scaleX = Math.min(app.screen.width / message.graph.value.width, 1);
    const scaleY = Math.min(app.screen.height / message.graph.value.height, 1);
    const scale = Math.min(scaleX, scaleY);
    app.stage.setTransform(0, 0, scale, scale);
  } else if (zoomModeInput.value === '1x') {
    app.stage.setTransform(0, 0, 1, 1);
  } else {
    const {x, y, width, height} = cam.viewport;
    app.stage.setTransform(-x / width, -y / height, 1 / width, 1 / height);
  }
});

cam.viewportObserver.observe((viewport) => {
  console.log(cam.bounds.clone(), cam.screen.clone(), cam.viewport.clone());
  if (zoomModeInput.value === 'scroll') {
    const {x, y, width, height} = cam.viewport;
    app.stage.setTransform(-x / width, -y / height, 1 / width, 1 / height);
  }
});

/** @type {Map<string, AudioNodeRender>} */
const nodeMap = new Map();
/** @type {Map<string, PIXI.Graphics>} */
const edgeMap = new Map();

/**
 * Manage the rendered representation of a WebAudio node.
 */
class AudioNodeRender {
  /**
   * Create a AudioNodeRender instance.
   * @param {string} id
   */
  constructor(id) {
    /** @type {string} */
    this.id = id;
    /** @type {Audion.GraphNode} */
    this.node = null;
    /** @type {PIXI.Container} */
    this.parent = null;
    /** @type {PIXI.Container} */
    this.container = null;
    /** @type {PIXI.Text} */
    this.title = null;
    /** @type {PIXI.Container} */
    this.labelContainer = null;
    /** @type {PIXI.Graphics} */
    this.background = null;
    /** @type {PIXI.Point} */
    this.size = new PIXI.Point();
    /** @type {PIXI.Point} */
    this.position = null;
    /** @type {Array<PIXI.Point>} */
    this.inputOffset = [];
    /** @type {Array<PIXI.Point>} */
    this.outputOffset = [];
    /** @type {Object<string, PIXI.Point>} */
    this.paramOffset = {};
  }
  static get INPUT_HEIGHT() {
    return 30;
  }
  static get INPUT_RADIUS() {
    return 10;
  }
  static get PARAM_HEIGHT() {
    return 20;
  }
  static get PARAM_RADIUS() {
    return 8;
  }
  /**
   * @param {Audion.GraphNode} node
   * @return {AudioNodeRender}
   */
  init(node) {
    if (
      this.node &&
      node.params.length === Object.keys(this.paramOffset).length
    ) {
      return this;
    }

    this.node = node;

    const container = (this.container = new PIXI.Container());
    this.position = container.position;

    const title = (this.title = new PIXI.Text(node.node.nodeType, {
      fill: Color.TEXT,
    }));
    const background = (this.background = new PIXI.Graphics());
    const labelContainer = (this.labelContainer = new PIXI.Container());
    container.addChild(background);
    container.addChild(labelContainer);
    container.addChild(title);

    this.draw();

    return this;
  }
  /**
   * @param {PIXI.Container} parent
   */
  setPixiParent(parent) {
    this.parent = parent;
    parent.addChild(this.container);
  }
  /**
   * Remove from the rendering hierarchy.
   */
  remove() {
    this.container.parent.removeChild(this.container);
  }
  /**
   * Update the rendering.
   */
  draw() {
    const {background, node, title} = this;
    const localBounds = new PIXI.Rectangle();

    this.inputOffset = [];
    this.outputOffset = [];
    this.paramOffset = {};

    this.labelContainer.removeChildren();

    const maxParamTextSize = new PIXI.Point();
    for (let i = 0; i < node.params.length; i++) {
      const param = node.params[i];

      const label = new PIXI.Text(param.paramType);
      this.labelContainer.addChild(label);
      label.getLocalBounds(localBounds);
      maxParamTextSize.x = Math.max(maxParamTextSize.x, localBounds.width);
      maxParamTextSize.y = Math.max(maxParamTextSize.y, localBounds.height);
    }

    title.getLocalBounds(localBounds);

    this.size.set(
      Math.max(localBounds.width, maxParamTextSize.x) + 30,
      localBounds.height +
        15 +
        Math.max(
          AudioNodeRender.INPUT_HEIGHT * node.node.numberOfInputs +
            AudioNodeRender.PARAM_HEIGHT * node.params.length,
          AudioNodeRender.INPUT_HEIGHT * node.node.numberOfOutputs,
        ),
    );

    background.clear();
    background.lineStyle(0);
    background.beginFill(colorFromNodeType(node.node.nodeType));
    background.drawRoundedRect(0, 0, this.size.x, this.size.y, 3);
    background.endFill();

    for (let i = 0; i < node.node.numberOfInputs; i++) {
      const point = (this.inputOffset[i] = new PIXI.Point(
        0,
        i * AudioNodeRender.INPUT_HEIGHT,
      ));
      background.lineStyle(3, Color.INPUT_OUTPUT);
      background.beginFill(0xffffff);
      background.drawCircle(point.x, point.y, AudioNodeRender.INPUT_RADIUS);
      background.endFill();
    }

    for (let i = 0; i < node.node.numberOfOutputs; i++) {
      const point = (this.outputOffset[i] = new PIXI.Point(
        this.size.x,
        i * AudioNodeRender.INPUT_HEIGHT,
      ));
      background.lineStyle(3, Color.INPUT_OUTPUT);
      background.beginFill(0xffffff);
      background.drawCircle(point.x, point.y, AudioNodeRender.INPUT_RADIUS);
      background.endFill();
    }

    for (let i = 0; i < node.params.length; i++) {
      const param = node.params[i];
      const point = (this.paramOffset[param.paramId] = new PIXI.Point(
        0,
        node.node.numberOfInputs * AudioNodeRender.INPUT_HEIGHT +
          i * AudioNodeRender.INPUT_HEIGHT,
      ));
      background.lineStyle(3, Color.AUDIO_PARAM);
      background.beginFill(0xffffff);
      background.drawCircle(point.x, point.y, AudioNodeRender.PARAM_RADIUS);
      background.endFill();

      const label = this.labelContainer.getChildAt(i);
      label.position.set(15, point.y);
    }
  }
}

/**
 * Create the rendering for an audio node.
 * @param {string} nodeId
 * @param {Audion.GraphNode} node
 * @return {AudioNodeRender}
 */
function createNodeRender(nodeId, node) {
  let nodeRender = nodeMap.get(nodeId);
  if (!nodeRender) {
    if (node.node && node.node.nodeType) {
      nodeRender = new AudioNodeRender(nodeId).init(node);
      nodeRender.setPixiParent(app.stage);
      nodeMap.set(nodeId, nodeRender);
    }
  }
  return nodeRender;
}

/**
 * Destroy the rendering for an audio node.
 * @param {*} nodeId
 */
function destroyNodeRender(nodeId) {
  const nodeRender = nodeMap.get(nodeId);
  if (nodeRender) {
    nodeRender.remove();
    nodeMap.delete(nodeId);
  }
}

/**
 * @param {string} edgeId
 * @param {*} edge
 * @return {PIXI.Graphics}
 */
function createEdgeRender(edgeId, edge) {
  let edgeRender = edgeMap.get(edgeId);
  if (!edgeRender) {
    edgeRender = new PIXI.Graphics();
    app.stage.addChild(edgeRender);

    edgeMap.set(edgeId, edgeRender);
  }
  return edgeRender;
}

/**
 * @param {string} edgeId
 */
function destroyEdgeRender(edgeId) {
  const edgeRender = edgeMap.get(edgeId);
  if (edgeRender) {
    edgeRender.parent.removeChild(edgeRender);
    edgeMap.delete(edgeId);
  }
}

layoutObserver.observe((message) => {
  g.clear();

  for (let i = 0; i < message.graph.nodes.length; i++) {
    const nodeKeyValue = message.graph.nodes[i];
    const nodeId = nodeKeyValue.v;
    const node = nodeKeyValue.value;

    if (node) {
      const nodeRender = createNodeRender(nodeId, message.nodes[nodeId]);
      nodeRender.position.set(
        node.x - nodeRender.size.x / 2,
        node.y - nodeRender.size.y / 2,
      );
    } else {
      destroyNodeRender(nodeId);
    }
  }
  for (const nodeId of nodeMap.keys()) {
    if (!message.graph.nodes.find((node) => node.v === nodeId)) {
      destroyNodeRender(nodeId);
    }
  }
  for (let i = 0; i < message.graph.edges.length; i++) {
    const edgeKeyValue = message.graph.edges[i];
    const edgeId = `${edgeKeyValue.v} ${edgeKeyValue.w}`;
    const edge = edgeKeyValue.value;

    if (edge) {
      const edgeRender = createEdgeRender(edgeId, edge);

      edgeRender.clear();
      edgeRender.lineStyle(2, 0x000000);
      edgeRender.moveTo(edge.points[0].x, edge.points[0].y);
      for (let j = 1; j < edge.points.length; j++) {
        edgeRender.lineTo(edge.points[j].x, edge.points[j].y);
      }
    }
  }
  for (const edgeId of edgeMap.keys()) {
    if (!message.graph.edges.find((edge) => `${edge.v} ${edge.w}` === edgeId)) {
      destroyEdgeRender(edgeId);
    }
  }
});

(function loop() {
  requestAnimationFrame(loop);

  cam.setScreenSize(app.screen.width, app.screen.height);
  app.render();
})();

layoutObserver.observe((message) => {
  document.getElementById('graph').innerText =
    `graph.nodes: ${message.graph.nodes.length} ` +
    `graph.edges: ${message.graph.edges.length}`;
});
