# living-ascii

**把一张静态图变成无缝循环的 ASCII 动画。**

图片会被拆成几十万根独立的细条（草叶），像鱼群一样随风摆动：一大片一起转向，每一根又有自己的小动作。最上面再叠一层 ASCII，**每个字符都会跟着底下的草叶一起转**。

[English](README.md)

<p>
  <img src="examples/demo.gif" width="300" alt="随风摆动的 ASCII 草地">
  <img src="examples/demo-detail.gif" width="400" alt="局部：每个字符跟着下面的草叶转">
</p>

全部是跑在 three.js 上的自定义 shader，没有文字对象，也没有用字体。在浏览器里实时渲染，导出的 MP4 首尾帧能无缝衔接。

## 快速开始

需要先安装 [Node.js](https://nodejs.org) 18 或以上版本。

```bash
git clone https://github.com/yusen-dev/living-ascii.git
cd living-ascii
npm install
npm start
```

打开 <http://localhost:5177> 就能看到示例效果。

用你自己的图片：把图放进 `input/` 文件夹，然后打开 `http://localhost:5177/?img=input/你的图片.jpg`。

## 导出视频

在网址后面加上 `export`，保持这个标签页在前台，直到左下角显示 `done`：

```
http://localhost:5177/?img=input/你的图片.jpg&export=ascii,flow
```

会得到两个文件：`out/你的图片-ascii.mp4`（ASCII 版）和 `out/你的图片-flow.mp4`（不带 ASCII 层的草叶版）。然后检查一下循环有没有跳帧：

```bash
npm run check -- out/你的图片-ascii.mp4
```

## 参数

都写在网址里，比如 `?img=input/x.jpg&wind=20&amp=1.3`。

| 参数 | 默认值 | 作用 |
|---|---|---|
| `img` | — | 要处理的图片（仓库里的路径） |
| `mode` | `ascii` | `ascii` 或 `flow`（只有草叶）。按 **M** 键切换 |
| `width` | `1080` | 输出宽度（像素），高度按图片比例 |
| `wind` | `auto` | 风向，单位是度（0 = 向右，90 = 向上）。`auto` 会沿着图片本身的纹理方向 |
| `light` | `130` | 图片里光从哪个方向来，单位是度（130 = 左上方） |
| `amp` | `1` | 摆动幅度 |
| `density` | `1` | 草叶数量倍数 |
| `loop` | `12` | 循环时长（秒） |
| `fps` | `30` | 导出帧率 |
| `t` | — | 定格在循环中的某个时刻（0–1），用来截静帧 |
| `export` | — | `ascii`、`flow` 或两个都要，渲染一个完整循环并编码成 MP4 |

按空格键暂停。

## 什么图效果最好

由大量朝同一方向的细笔触组成的画面：草地、麦田、毛发、头发、芦苇、笔触明显的油画、被风吹皱的水面。边缘很硬的复杂画面（建筑、人脸）效果会差一些，轮廓会被草叶拉花。

## 原理

1. **读图**：把图片亮度按大小两种尺度模糊，得到大的起伏和小的草团；再用结构张量算出每个位置的纹理走向。
2. **拆成草叶**：大约 16 万根（1080×1772 的画面），每根是一条 7 段的细带，带着它静止时覆盖的那块原图颜色，朝向沿着纹理。
3. **像鱼群一样动**：所有草叶共用一个方向场：一道道转向波扫过画面，几群“小鱼群”漂移着在不同时刻转向，整个画面缓慢左右偏，每根草再加一点自己的颤动。草尖比草根慢半拍，转向时有甩动感。
4. **光影**：太阳绕着原图本来的光源方向摆动，给起伏重新打光；云缝里的光斑漂过；草叶转到迎光的角度时会闪亮。
5. **ASCII**：再渲染一遍，记录的是每根草叶此刻的朝向，而不是颜色。每个 5×7 的格子从 32 种笔画（8 个角度 × 4 档粗细，同一档在各个角度点亮的像素数相同）里挑一个和下面草叶方向一致的。颜色逐格计算，让正常观看尺寸下的平均颜色等于原图：高光不过曝、不荧光，阴影不死黑。
6. **循环**：所有动态项在一个循环里都重复整数次，所以最后一帧能精确接回第一帧。

## 文件

```
src/maps.js      图片 → 起伏图和纹理方向图
src/field.js     草叶、动态和光影（顶点 + 片元 shader）
src/ascii.js     ASCII 层：笔画字形表和逐格配色
src/post.js      渲染目标、flow 调色、模式切换
src/main.js      网址参数、实时预览、逐帧导出
server.mjs       本地服务器 + ffmpeg 编码
scripts/check-loop.mjs   无缝循环检查
SKILL.md         给 Claude Code / AI agent 的使用说明
```

## 作为 Claude Code skill 使用

`SKILL.md` 把整套流程（包括验收检查）教给 agent。把仓库放进你的 skills 文件夹：

```bash
git clone https://github.com/yusen-dev/living-ascii.git ~/.claude/skills/living-ascii
```

然后对 Claude Code 说“把这张图做成 ASCII 循环动画”之类的话就行。

## 致谢

用 Claude Opus 5.5 制作。灵感来自 [ascii-diorama](https://github.com/JDhruv14/ascii-diorama)。

MIT 协议。
