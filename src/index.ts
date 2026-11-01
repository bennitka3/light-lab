import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { LightingLevelSystem } from './lighting-level.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Render the two eyes separately instead of with multiview. In multiview,
  // three.js lights the scene from the combined camera (a few cm behind the
  // eyes) while each eye's pixels use their own view. On a 1:14 dollhouse that
  // shift moves a nearby light's beam off its target: on ben's Quest 1 the
  // overhead light in scene 5 missed the actor entirely, though the iPad's
  // camera render (not multiview) showed it right. WebXRManager checks this
  // extension when a session starts, so hiding it turns multiview off.
  const extensions = world.renderer.extensions;
  const has = extensions.has.bind(extensions);
  extensions.has = (name: string) => (name === 'OCULUS_multiview' ? false : has(name));
  world.registerSystem(LightingLevelSystem);
});
