语言: [EN](README.md) | 简中

# region-recorder

> **Fork 说明：** 本仓库是 [Recordly](https://github.com/webadderallorg/Recordly)（作者
> webadderallorg）的修改版，同样以 AGPLv3 授权发布（见 [LICENSE.md](LICENSE.md)）。下面列出的改动
> **不属于**上游项目，原项目的所有功劳归 Recordly 作者所有；本 Fork 没有把 Recordly 的名称与品牌
> 当作自己项目的名称。

一个桌面录屏 + 剪辑工具（支持 Windows / macOS / Linux），在上游 Recordly 的基础上加了三件事：

| 本 Fork 新增 | 作用 |
| --- | --- |
| **自定义录制区域** | 在当前选中的屏幕/窗口上拖拽一个矩形，只录制这块区域 |
| **已移除区间标记** | 剪掉的片段会在时间线上显示为红色 `Trim` 区块，而不是一片空白 |
| **摄像头气泡阴影** | 改成深玫红（`#881337`），阴影范围比上游收紧很多 |

---

## 1. 自定义录制区域

**怎么用**

1. 打开录制条上的来源选择。
2. 选最下面那一组里的 **自定义区域**。
3. 在选中的屏幕/窗口上拖拽出矩形，按 **回车**（或点 **确定**）确认；`Esc` 取消。
4. 正常录制。选区只对这一条录制生效，录完自动清除。

**原理** —— 仍然是按原有的原生采集路径录制整屏/整个窗口，停止录制后再用 FFmpeg 按你框的矩形裁剪。
所以画质、系统声音、麦克风、光标轨迹都不受影响。因为裁剪发生在停止之后，进编辑器前会有一小段处理时间。

**限制**

- 裁剪依赖原生采集路径（Windows / macOS 默认就是）。如果某台机器退化成浏览器采集，区域不会生效。
- 界面本身仍是上游的 Recordly 品牌，本 Fork 没有做去品牌化。

## 2. 时间线上的已移除标记

按 `C` 拆分片段，选中中间那段按 `Delete`（或 `Ctrl+D`）删除后，被剪掉的区间会显示成红色的
`Trim` 区块，而不是空白。这个区块不能拖动、不能拉伸、也不能选中；预览播放和导出都会自动跳过它。

## 3. 摄像头气泡阴影

摄像头气泡的阴影改成深玫红（`rgb(136, 19, 55)`，`#881337`），并且范围比上游收紧很多。它只在一个
地方生成，所以编辑器预览和导出视频永远一致；画布/视频本身的阴影仍是默认的黑色。

---

## 运行要求

| 平台 | 最低要求 | 说明 |
| --- | --- | --- |
| **Windows** | Windows 10 19041 及以上 | 需要原生 Windows Graphics Capture (WGC) 助手 |
| **macOS** | 14.0 (Sonoma) | ScreenCaptureKit 音频与麦克风采集 |
| **Linux** | 现代发行版 | 走 Electron 采集；系统声音通常需要 PipeWire |

## 开发

```bash
git clone https://github.com/Hellenli624/region-recorder.git
cd region-recorder
npm install
npm run dev
```

类型检查与测试（本 Fork 已验证：`tsc` 无错误，1098 项测试通过）：

```bash
npx tsc --noEmit
npm test
```

打包：

```bash
npm run build        # 同时会编译原生助手
npm run build:win
npm run build:mac
npm run build:linux
```

原生助手已经以预编译二进制形式提交在 `electron/native/bin/` 下，所以只有你想自己重新编译时才需要原生
工具链（Windows 上是 Visual Studio 2022 + CMake）。也可以用 `pnpm` 代替 `npm`。

## 与上游同步

本仓库是以"快照"方式发布的，因此历史与上游没有共同祖先。第一次同步是一次性的：

```bash
git remote add upstream https://github.com/webadderallorg/Recordly.git   # 没有的话才需要
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

这次合并之后两条历史就打通了，后续同步就是正常流程。

## 许可证

AGPLv3，见 [LICENSE.md](LICENSE.md)。上游条款还要求保留上面的来源标注，并且**不能**把 "Recordly"
的名称与品牌当作本项目的名称或品牌。

## 致谢

原项目：[Recordly](https://github.com/webadderallorg/Recordly)，作者 webadderallorg。
