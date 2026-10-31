import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { LightingLevelSystem } from './lighting-level.js';
import { PanelSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(LightingLevelSystem);
  world.registerSystem(PanelSystem);
});
