/** 参考模板底图。图片自身按 30×30 语义格绘制，交互仍使用原地图坐标。 */
import mapTemplateSrc from '../../地图相关素材/地图参考模板.jpg';

export const MAP_IMAGE_WIDTH = 1264;
export const MAP_IMAGE_HEIGHT = 1244;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`地图模板加载失败: ${src}`));
    image.src = src;
  });
}

export async function createMapPainter() {
  const image = await loadImage(mapTemplateSrc);
  return {
    paint(ctx) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, 30, 30);
      ctx.restore();
    },
  };
}
