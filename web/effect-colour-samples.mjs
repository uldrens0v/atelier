import {abilityRgb, abilityTexturePixels} from './ability-colour.mjs';

function swatchColour(sample, settings) {
 const scale = sample.format === 'u8' ? 255 : 1;
 const rgb = abilityRgb(sample.rgba.slice(0, 3), settings);
 return `rgb(${rgb.map(value => Math.round(255 * Math.max(0, Math.min(1, value / scale)))).join(' ')})`;
}

export class EffectColourSamples {
 constructor(data, textures) {
  this.data = data;
  this.texture = textures[0]?.[1]?.image;
  this.element = document.createElement('div');
  this.element.className = 'effect-colour-samples';
  this.original = this.column('Original');
  this.changed = this.column('Custom colour');
  this.element.append(this.original.root, this.changed.root);
  this.paint(this.original, undefined);
 }

 column(label) {
  const root = document.createElement('section');
  root.setAttribute('aria-label', label);
  const title = document.createElement('strong');
  title.textContent = label;
  root.append(title);
  const canvas = this.texture ? document.createElement('canvas') : null;
  if (canvas) {
   canvas.width = this.texture.width;
   canvas.height = this.texture.height;
   canvas.setAttribute('aria-label', label + ' effect texture');
   root.append(canvas);
  }
  const row = document.createElement('div');
  row.className = 'effect-swatch-row';
  root.append(row);
  const swatches = this.data.swatches.map(() => {
   const element = document.createElement('span');
   row.append(element);
   return element;
  });
  return {root, canvas, swatches};
 }

 paint(column, settings) {
  if (column.canvas) {
   const {width, height, pixels} = this.texture;
   const image = new ImageData(abilityTexturePixels(pixels, settings), width, height);
   column.canvas.getContext('2d').putImageData(image, 0, 0);
  }
  for (const [index, sample] of this.data.swatches.entries()) {
   const colour = swatchColour(sample, settings);
   column.swatches[index].style.background = colour;
   column.swatches[index].title = colour;
  }
 }

 render(settings) {
  this.paint(this.changed, settings);
 }

 dispose() {
  this.element.remove();
 }
}
