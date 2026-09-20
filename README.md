# BlockCounter Minecraft Bedrock Addon

## 專案簡介

BlockCounter 是一個基於 Minecraft Bedrock Script API v1.13.0+ 開發的方塊統計與全息投影預覽模組。

玩家可以使用專用工具選取區域、統計其中的方塊數量，並在目標位置即時預覽準備貼上的結構。

## 核心功能

- 手持工具選擇 P1/P2 座標，並統計選取區域內的方塊數量
- 全息投影即時預覽，支援 0°、90°、180°、270° 旋轉
- 非完整方塊備援渲染機制，支援階梯、半磚、按鈕等方塊以對應的完整方塊材質顯示
- 支援全息投影互動與生存模式材料放置功能
- 提供結構貼上與上一次操作復原功能

## 預計開發項目

- 手動輸入座標（X、Y、Z）的全息投影 UI 介面

## 目錄結構

```text
BlockCounter_Build/
├── BlockCounter_BP/
│   ├── manifest.json
│   ├── blocks/                 # 方塊定義與方塊相關資料
│   ├── entities/               # 行為包中的實體定義
│   ├── items/                  # 工具與物品定義
│   └── scripts/
│       └── main.js             # Script API 主程式：統計、投影、旋轉與互動邏輯
└── BlockCounter_RP/
    ├── manifest.json
    ├── entity/                  # 客戶端實體定義
    ├── models/entity/           # 全息方塊的幾何模型
    ├── render_controllers/      # 材質索引與渲染控制
    └── textures/                # 方塊、實體與物品貼圖
```

### BlockCounter_BP

行為包（Behavior Pack），負責遊戲邏輯，包括 Script API 腳本、工具與物品行為、方塊定義，以及全息投影的建立與管理。

### BlockCounter_RP

資源包（Resource Pack），負責客戶端顯示，包括全息實體模型、渲染控制器、材質索引與各類貼圖。
