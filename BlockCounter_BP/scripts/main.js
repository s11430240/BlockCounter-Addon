import { 
    world, 
    system, 
    ItemStack, 
    BlockComponentTypes, 
    BlockPermutation,
    Direction,
    GameMode
} from "@minecraft/server";
import { 
    ModalFormData, 
    ActionFormData 
} from "@minecraft/server-ui";

world.sendMessage("§e[系統提示] BlockCounter v1.0.4 已成功載入！(若你沒看到這行版本號更新，代表遊戲還在用舊快取，請完全關閉遊戲重開)");

// ==========================================
// 1. 全域變數與數據儲存
// ==========================================

const playerSelections = new Map();
const playerIntervals = new Map();
const playerFilterLists = new Map();
const playerClipboards = new Map();
const playerPreviews = new Map();
const activeHologramEntities = new Map();

// 儲存每個玩家上一次操作前區域的方塊數據 (Undo 機制)
const playerUndoHistory = new Map();

const MAX_BLOCK_LIMIT = 250000;

const DEFAULT_FILTER_LIST = [
    "minecraft:air",
    "minecraft:dirt",
    "minecraft:grass_block",
    "minecraft:stone",
    "minecraft:deepslate",
    "minecraft:water",
    "minecraft:lava"
];

// ==========================================
// 1-1. 方塊材質對照表 (index 必須與 RP 的
//      render_controllers / entity 貼圖陣列順序完全一致，
//      index 0 為找不到對應材質時的預留 "未知材質" 貼圖)
// ==========================================

const BLOCK_TEXTURE_TABLE = [
    [1, ["minecraft:stone"]],
    [2, ["minecraft:granite"]],
    [3, ["minecraft:polished_granite"]],
    [4, ["minecraft:diorite"]],
    [5, ["minecraft:polished_diorite"]],
    [6, ["minecraft:andesite"]],
    [7, ["minecraft:polished_andesite"]],
    [8, ["minecraft:dirt", "minecraft:coarse_dirt"]],
    [9, ["minecraft:grass_block"]],
    [10, ["minecraft:cobblestone"]],
    [11, ["minecraft:mossy_cobblestone"]],
    [12, ["minecraft:oak_planks"]],
    [13, ["minecraft:spruce_planks"]],
    [14, ["minecraft:birch_planks"]],
    [15, ["minecraft:jungle_planks"]],
    [16, ["minecraft:acacia_planks"]],
    [17, ["minecraft:dark_oak_planks"]],
    [18, ["minecraft:oak_log", "minecraft:stripped_oak_log"]],
    [19, ["minecraft:spruce_log", "minecraft:stripped_spruce_log"]],
    [20, ["minecraft:birch_log", "minecraft:stripped_birch_log"]],
    [21, ["minecraft:jungle_log", "minecraft:stripped_jungle_log"]],
    [22, ["minecraft:oak_leaves"]],
    [23, ["minecraft:spruce_leaves"]],
    [24, ["minecraft:bedrock"]],
    [25, ["minecraft:sand"]],
    [26, ["minecraft:red_sand"]],
    [27, ["minecraft:gravel"]],
    [28, ["minecraft:gold_ore"]],
    [29, ["minecraft:iron_ore"]],
    [30, ["minecraft:coal_ore"]],
    [31, ["minecraft:diamond_ore"]],
    [32, ["minecraft:emerald_ore"]],
    [33, ["minecraft:redstone_ore"]],
    [34, ["minecraft:lapis_ore"]],
    [35, ["minecraft:lapis_block"]],
    [36, ["minecraft:glass"]],
    [37, ["minecraft:white_wool"]],
    [38, ["minecraft:orange_wool"]],
    [39, ["minecraft:magenta_wool"]],
    [40, ["minecraft:light_blue_wool"]],
    [41, ["minecraft:yellow_wool"]],
    [42, ["minecraft:lime_wool"]],
    [43, ["minecraft:pink_wool"]],
    [44, ["minecraft:gray_wool"]],
    [45, ["minecraft:light_gray_wool"]],
    [46, ["minecraft:cyan_wool"]],
    [47, ["minecraft:purple_wool"]],
    [48, ["minecraft:blue_wool"]],
    [49, ["minecraft:brown_wool"]],
    [50, ["minecraft:green_wool"]],
    [51, ["minecraft:red_wool"]],
    [52, ["minecraft:black_wool"]],
    [53, ["minecraft:gold_block"]],
    [54, ["minecraft:iron_block"]],
    [55, ["minecraft:diamond_block"]],
    [56, ["minecraft:emerald_block"]],
    [57, ["minecraft:bricks"]],
    [58, ["minecraft:bookshelf"]],
    [59, ["minecraft:obsidian"]],
    [60, ["minecraft:furnace"]],
    [61, ["minecraft:crafting_table"]],
    [62, ["minecraft:ice"]],
    [63, ["minecraft:packed_ice"]],
    [64, ["minecraft:snow", "minecraft:snow_block"]],
    [65, ["minecraft:clay"]],
    [66, ["minecraft:netherrack"]],
    [67, ["minecraft:soul_sand"]],
    [68, ["minecraft:glowstone"]],
    [69, ["minecraft:nether_bricks"]],
    [70, ["minecraft:end_stone"]],
    [71, ["minecraft:quartz_block"]],
    [72, ["minecraft:sea_lantern"]],
    [73, ["minecraft:purpur_block"]],
    [74, ["minecraft:magma_block"]],
    [75, ["minecraft:hay_block"]],
    [76, ["minecraft:melon_block"]],
    [77, ["minecraft:pumpkin", "minecraft:carved_pumpkin"]],
    [78, ["minecraft:mycelium"]],
    [79, ["minecraft:podzol"]],
    [80, ["minecraft:stone_bricks"]],
    [81, ["minecraft:mossy_stone_bricks"]],
    [82, ["minecraft:cracked_stone_bricks"]],
    [83, ["minecraft:chiseled_stone_bricks"]],
    [84, ["minecraft:white_concrete"]],
    [85, ["minecraft:orange_concrete"]],
    [86, ["minecraft:gray_concrete"]],
    [87, ["minecraft:black_concrete"]],
    [88, ["minecraft:red_concrete"]],
    [89, ["minecraft:blue_concrete"]],
    [90, ["minecraft:magenta_concrete"]],
    [91, ["minecraft:light_blue_concrete"]],
    [92, ["minecraft:yellow_concrete"]],
    [93, ["minecraft:lime_concrete"]],
    [94, ["minecraft:pink_concrete"]],
    [95, ["minecraft:light_gray_concrete"]],
    [96, ["minecraft:cyan_concrete"]],
    [97, ["minecraft:purple_concrete"]],
    [98, ["minecraft:brown_concrete"]],
    [99, ["minecraft:green_concrete"]],
    [100, ["minecraft:white_stained_glass"]],
    [101, ["minecraft:orange_stained_glass"]],
    [102, ["minecraft:magenta_stained_glass"]],
    [103, ["minecraft:light_blue_stained_glass"]],
    [104, ["minecraft:yellow_stained_glass"]],
    [105, ["minecraft:lime_stained_glass"]],
    [106, ["minecraft:pink_stained_glass"]],
    [107, ["minecraft:gray_stained_glass"]],
    [108, ["minecraft:light_gray_stained_glass"]],
    [109, ["minecraft:cyan_stained_glass"]],
    [110, ["minecraft:purple_stained_glass"]],
    [111, ["minecraft:blue_stained_glass"]],
    [112, ["minecraft:brown_stained_glass"]],
    [113, ["minecraft:green_stained_glass"]],
    [114, ["minecraft:red_stained_glass"]],
    [115, ["minecraft:black_stained_glass"]],
    [116, ["minecraft:white_terracotta"]],
    [117, ["minecraft:orange_terracotta"]],
    [118, ["minecraft:magenta_terracotta"]],
    [119, ["minecraft:light_blue_terracotta"]],
    [120, ["minecraft:yellow_terracotta"]],
    [121, ["minecraft:lime_terracotta"]],
    [122, ["minecraft:pink_terracotta"]],
    [123, ["minecraft:gray_terracotta"]],
    [124, ["minecraft:light_gray_terracotta"]],
    [125, ["minecraft:cyan_terracotta"]],
    [126, ["minecraft:purple_terracotta"]],
    [127, ["minecraft:blue_terracotta"]],
    [128, ["minecraft:brown_terracotta"]],
    [129, ["minecraft:green_terracotta"]],
    [130, ["minecraft:red_terracotta"]],
    [131, ["minecraft:black_terracotta"]],
    [132, ["minecraft:terracotta"]]
];

// 未知材質時使用 index 0 (RP 中的 hologram_unknown 棋盤格貼圖)
const UNKNOWN_TEXTURE_INDEX = 0;

const BLOCK_TEXTURE_INDEX_MAP = new Map();
for (const [index, ids] of BLOCK_TEXTURE_TABLE) {
    for (const id of ids) {
        BLOCK_TEXTURE_INDEX_MAP.set(id, index);
    }
}

/**
 * 依方塊 typeId 找出對應的材質索引 (對應 RP 貼圖陣列)。
 * 找不到對應材質時，回傳 UNKNOWN_TEXTURE_INDEX，而不是靜默顯示成泥土。
 */
function getTextureIndexForBlock(typeId) {
    if (!typeId) return UNKNOWN_TEXTURE_INDEX;
    if (BLOCK_TEXTURE_INDEX_MAP.has(typeId)) return BLOCK_TEXTURE_INDEX_MAP.get(typeId);

    const aliasId = resolveNonFullBlockAlias(typeId);
    if (aliasId && BLOCK_TEXTURE_INDEX_MAP.has(aliasId)) return BLOCK_TEXTURE_INDEX_MAP.get(aliasId);

    return UNKNOWN_TEXTURE_INDEX;
}

// ==========================================
// 1-2b. 明確指定的方塊備援字典 (BLOCK_FALLBACK_MAP)
//      優先權最高：這裡列出的方塊一律直接用指定的完整方塊材質顯示，
//      不需要再靠下面的自動後綴推算。之後要手動微調某個方塊的
//      投影材質，就直接改這裡最快。
// ==========================================
const BLOCK_FALLBACK_MAP = {
    // --- 木頭家具類 (不是靠後綴推算得出的特殊方塊) ---
    "minecraft:bed": "minecraft:oak_planks",
    "minecraft:flower_pot": "minecraft:oak_planks",
    "minecraft:cauldron": "minecraft:iron_block",
    "minecraft:lectern": "minecraft:oak_planks",
    "minecraft:campfire": "minecraft:oak_log",
    "minecraft:soul_campfire": "minecraft:oak_log",
    "minecraft:cake": "minecraft:white_wool",
    "minecraft:anvil": "minecraft:iron_block",
    "minecraft:end_rod": "minecraft:quartz_block",
    "minecraft:lantern": "minecraft:iron_block",
    "minecraft:soul_lantern": "minecraft:iron_block",
    "minecraft:chain": "minecraft:iron_block",
    "minecraft:scaffolding": "minecraft:oak_planks",
    "minecraft:ladder": "minecraft:oak_planks",
    "minecraft:item_frame": "minecraft:oak_planks",
    "minecraft:glow_item_frame": "minecraft:oak_planks",

    // --- 範例中明確提到的方塊，直接寫死對照，確保 100% 正確 ---
    "minecraft:spruce_stairs": "minecraft:spruce_planks",
    "minecraft:spruce_slab": "minecraft:spruce_planks",
    "minecraft:spruce_double_slab": "minecraft:spruce_planks",
    "minecraft:spruce_door": "minecraft:spruce_planks",
    "minecraft:spruce_trapdoor": "minecraft:spruce_planks",
    "minecraft:spruce_fence": "minecraft:spruce_planks",
    "minecraft:spruce_fence_gate": "minecraft:spruce_planks",
    "minecraft:spruce_button": "minecraft:spruce_planks",
    "minecraft:spruce_pressure_plate": "minecraft:spruce_planks",
    "minecraft:wooden_button": "minecraft:oak_planks",
    "minecraft:wooden_pressure_plate": "minecraft:oak_planks",
    "minecraft:wooden_door": "minecraft:oak_planks",
    "minecraft:iron_door": "minecraft:iron_block",
    "minecraft:iron_trapdoor": "minecraft:iron_block",
    "minecraft:stone_button": "minecraft:stone",
    "minecraft:stone_pressure_plate": "minecraft:stone",
    "minecraft:glass_pane": "minecraft:glass",

    // --- 地毯 (顏色跟羊毛一樣，直接借用羊毛材質顯示) ---
    "minecraft:white_carpet": "minecraft:white_wool",
    "minecraft:orange_carpet": "minecraft:orange_wool",
    "minecraft:magenta_carpet": "minecraft:magenta_wool",
    "minecraft:light_blue_carpet": "minecraft:light_blue_wool",
    "minecraft:yellow_carpet": "minecraft:yellow_wool",
    "minecraft:lime_carpet": "minecraft:lime_wool",
    "minecraft:pink_carpet": "minecraft:pink_wool",
    "minecraft:gray_carpet": "minecraft:gray_wool",
    "minecraft:light_gray_carpet": "minecraft:light_gray_wool",
    "minecraft:cyan_carpet": "minecraft:cyan_wool",
    "minecraft:purple_carpet": "minecraft:purple_wool",
    "minecraft:blue_carpet": "minecraft:blue_wool",
    "minecraft:brown_carpet": "minecraft:brown_wool",
    "minecraft:green_carpet": "minecraft:green_wool",
    "minecraft:red_carpet": "minecraft:red_wool",
    "minecraft:black_carpet": "minecraft:black_wool"
};

// ==========================================
// 1-3. 非完整方塊 (半磚/樓梯/按鈕/門/檔板/柵欄/牆/壓力板) 材質備援
//      全息實體只有「同材質的完整方塊」貼圖，所以遇到這類方塊時，
//      改用它「同材質的完整方塊」代替顯示，避免出現黑紫網格 (Missing Texture)。
//      優先順序：BLOCK_FALLBACK_MAP (明確指定) > 後綴自動推算 > 未知材質棋盤格
// ==========================================

// 木頭類方塊，去掉結構後綴會得到樹種名稱，直接補上 "_planks"
const WOOD_SPECIES = new Set([
    "oak", "spruce", "birch", "jungle", "acacia", "dark_oak",
    "crimson", "warped", "mangrove", "cherry", "bamboo"
]);

// 去掉結構後綴後名稱對不上完整方塊命名的特例，直接指定完整方塊 id
const IRREGULAR_BASE_BLOCK = {
    "stone": "minecraft:stone",
    "cobblestone": "minecraft:cobblestone",
    "mossy_cobblestone": "minecraft:mossy_cobblestone",
    "stone_brick": "minecraft:stone_bricks",
    "mossy_stone_brick": "minecraft:mossy_stone_bricks",
    "brick": "minecraft:bricks",
    "nether_brick": "minecraft:nether_bricks",
    "quartz": "minecraft:quartz_block",
    "purpur": "minecraft:purpur_block",
    "granite": "minecraft:granite",
    "diorite": "minecraft:diorite",
    "andesite": "minecraft:andesite",
    "polished_granite": "minecraft:polished_granite",
    "polished_diorite": "minecraft:polished_diorite",
    "polished_andesite": "minecraft:polished_andesite",
    "iron": "minecraft:iron_block",
    "gold": "minecraft:gold_block",
    // 沒有樹種名稱的舊版通用木製按鈕/壓力板，一律用橡木代表
    "wooden": "minecraft:oak_planks",
    "wood": "minecraft:oak_planks"
};

// 依出現機率排序，較長/較特殊的後綴要放前面，避免被較短的後綴誤先比對到
const NON_FULL_BLOCK_SUFFIXES = [
    "_double_slab", "_slab",
    "_stairs",
    "_fence_gate", "_fence",
    "_wall",
    "_pressure_plate",
    "_button",
    "_trapdoor",
    "_door",
    "_pane",
    "_carpet"
];

const NON_FULL_ALIAS_CACHE = new Map();

/**
 * 把半磚/樓梯/按鈕/門/柵欄/牆/壓力板等非完整方塊的 typeId，
 * 轉換成「同材質完整方塊」的 typeId，讓全息投影能顯示接近的材質，
 * 而不是直接顯示遺失材質網格。找不到合理對應時回傳 null。
 */
function resolveNonFullBlockAlias(typeId) {
    if (NON_FULL_ALIAS_CACHE.has(typeId)) return NON_FULL_ALIAS_CACHE.get(typeId);

    // 1. 先查明確指定的字典，這個優先權最高
    if (BLOCK_FALLBACK_MAP[typeId]) {
        NON_FULL_ALIAS_CACHE.set(typeId, BLOCK_FALLBACK_MAP[typeId]);
        return BLOCK_FALLBACK_MAP[typeId];
    }

    // 2. 字典裡沒有的話，再用後綴自動推算
    const bareId = typeId.includes(":") ? typeId.split(":")[1] : typeId;
    let result = null;

    for (const suffix of NON_FULL_BLOCK_SUFFIXES) {
        if (!bareId.endsWith(suffix)) continue;

        const base = bareId.slice(0, -suffix.length);

        if (WOOD_SPECIES.has(base)) {
            result = `minecraft:${base}_planks`;
        } else if (IRREGULAR_BASE_BLOCK[base]) {
            result = IRREGULAR_BASE_BLOCK[base];
        } else {
            // 沒有特例對照時，先試著直接把 base 當作完整方塊 id 猜一次
            // (例如 "sandstone_stairs" -> "minecraft:sandstone")
            result = `minecraft:${base}`;
        }
        break;
    }

    NON_FULL_ALIAS_CACHE.set(typeId, result);
    return result;
}

/**
 * 取得全息實體使用的完整方塊材質 ID；不修改投影資料中的原始方塊 ID。
 */
function getBlockGeometryWithFallback(blockId) {
    if (!blockId) return "minecraft:stone";
    if (BLOCK_TEXTURE_INDEX_MAP.has(blockId)) return blockId;

    const fallbackId = resolveNonFullBlockAlias(blockId);
    if (fallbackId && BLOCK_TEXTURE_INDEX_MAP.has(fallbackId)) return fallbackId;

    return "minecraft:stone";
}

// ==========================================
// 1-2. 方塊旋轉 (角度) 輔助工具
//      負責讓方塊自身的朝向 (門、樓梯、原木等) 隨著
//      投影/貼上的旋轉角度一起轉動，而不是永遠維持原始朝向
// ==========================================

// 與 rotateRelCoords 的座標旋轉方向保持一致：順時鐘 90 度為一個單位
const HORIZONTAL_CYCLE = ["north", "east", "south", "west"];

function rotateHorizontalValue(value, rotation) {
    const idx = HORIZONTAL_CYCLE.indexOf(value);
    if (idx === -1) return value; // 不是水平方向 (例如 up / down)，不處理
    return HORIZONTAL_CYCLE[(idx + rotation) % 4];
}

// 舊版樓梯 "weirdo_direction" 的方向對照 (0=east,1=west,2=south,3=north)
const STAIR_DIRECTION_CYCLE = ["east", "west", "south", "north"];

function rotateStatesInPlace(states, rotation) {
    if (!states || rotation === 0) return states;

    if (typeof states["minecraft:cardinal_direction"] === "string") {
        states["minecraft:cardinal_direction"] = rotateHorizontalValue(states["minecraft:cardinal_direction"], rotation);
    }

    if (typeof states["minecraft:facing_direction"] === "string") {
        states["minecraft:facing_direction"] = rotateHorizontalValue(states["minecraft:facing_direction"], rotation);
    }

    if (typeof states["minecraft:block_face"] === "string") {
        states["minecraft:block_face"] = rotateHorizontalValue(states["minecraft:block_face"], rotation);
    }

    if (typeof states["weirdo_direction"] === "number") {
        const cur = STAIR_DIRECTION_CYCLE[states["weirdo_direction"]] ?? "east";
        const rotated = rotateHorizontalValue(cur, rotation);
        const newIdx = STAIR_DIRECTION_CYCLE.indexOf(rotated);
        if (newIdx !== -1) states["weirdo_direction"] = newIdx;
    }

    if (typeof states["minecraft:pillar_axis"] === "string" && rotation % 2 === 1) {
        // 90 度或 270 度旋轉時，原木的 X / Z 軸互換；Y 軸原木不受影響
        if (states["minecraft:pillar_axis"] === "x") states["minecraft:pillar_axis"] = "z";
        else if (states["minecraft:pillar_axis"] === "z") states["minecraft:pillar_axis"] = "x";
    }

    return states;
}

/**
 * 依旋轉角度回傳一個「朝向已修正」的方塊排列 (permutation)。
 * 只調整已知的方向性狀態，其餘狀態原樣保留；失敗時安全退回原始 permutation。
 */
function rotatePermutation(permutation, rotation) {
    if (!permutation || rotation === 0) return permutation;
    try {
        const typeId = permutation.type.id;
        const states = { ...permutation.getAllStates() };
        rotateStatesInPlace(states, rotation);
        return BlockPermutation.resolve(typeId, states);
    } catch (e) {
        return permutation;
    }
}

/**
 * 依右鍵點擊的面向，回傳應該疊加的座標偏移量。
 * 用於讓投影/貼上的基準點對齊到「點擊面的外側」(例如點擊地面 = 蓋在地面之上)，
 * 而不是直接嵌入被點擊的方塊本身 (這正是造成投影「高度」偏低 1 格的原因)。
 */
function getFaceOffset(face) {
    switch (face) {
        case Direction.Up: return { x: 0, y: 1, z: 0 };
        case Direction.Down: return { x: 0, y: -1, z: 0 };
        case Direction.North: return { x: 0, y: 0, z: -1 };
        case Direction.South: return { x: 0, y: 0, z: 1 };
        case Direction.East: return { x: 1, y: 0, z: 0 };
        case Direction.West: return { x: -1, y: 0, z: 0 };
        default: return { x: 0, y: 1, z: 0 }; // 沒有面向資訊時，預設蓋在方塊上方
    }
}

function applyFaceOffset(pos, face) {
    const off = getFaceOffset(face);
    return { x: pos.x + off.x, y: pos.y + off.y, z: pos.z + off.z };
}

// ==========================================
// 2. 基礎輔助工具函式
// ==========================================

function checkIsOp(player) {
    try {
        return player.isOp;
    } catch (e) {
        return true;
    }
}

function getPlayerFilterList(pId) {
    if (!playerFilterLists.has(pId)) {
        playerFilterLists.set(pId, [...DEFAULT_FILTER_LIST]);
    }
    return playerFilterLists.get(pId);
}

function isContainer(typeId) {
    if (!typeId) return false;
    const id = typeId.toLowerCase();
    return id.includes("shulker") || id.includes("chest") || id.includes("barrel");
}

function formatItemAmount(amount) {
    const stack = Math.floor(amount / 64);
    const remainder = amount % 64;
    
    if (stack > 0 && remainder > 0) return `${stack}組 ${remainder}個 (${amount})`;
    if (stack > 0) return `${stack}組 (${amount})`;
    return `${remainder}個 (${amount})`;
}

function safeShowForm(player, form, onComplete) {
    form.show(player).then((response) => {
        if (!response.canceled && onComplete) {
            onComplete(response);
        }
    }).catch((err) => {
        console.warn("[BlockCounter] UI 顯示異常: " + err);
    });
}

function getMinMax(p1, p2) {
    return {
        minX: Math.min(p1.x, p2.x),
        maxX: Math.max(p1.x, p2.x),
        minY: Math.min(p1.y, p2.y),
        maxY: Math.max(p1.y, p2.y),
        minZ: Math.min(p1.z, p2.z),
        maxZ: Math.max(p1.z, p2.z)
    };
}

function getPlayerCardinalDirection(player) {
    const yRot = player.getRotation().y;
    const normY = (yRot % 360 + 360) % 360;
    
    if (normY >= 45 && normY < 135) return 1; // 西 (-X)
    if (normY >= 135 && normY < 225) return 2; // 北 (-Z)
    if (normY >= 225 && normY < 315) return 3; // 東 (+X)
    return 0;                                  // 南 (+Z)
}

/**
 * 依角度差旋轉相對座標 (relX, relZ)。
 * 注意：這裡的 rotation 必須是「目前方向 - 複製當下方向」的差值 (0~3)，
 * 不能直接傳入絕對方向，否則複製與貼上朝向剛好相同時仍可能被錯誤旋轉。
 * rotation=0 時保證直接回傳 { rx: relX, rz: relZ }，完全不偏移。
 */
function rotateRelCoords(relX, relZ, sizeX, sizeZ, rotation) {
    const rot = ((rotation % 4) + 4) % 4;
    switch (rot) {
        case 1: return { rx: -relZ, rz: relX };   // 順時鐘 90 度
        case 2: return { rx: -relX, rz: -relZ };  // 180 度
        case 3: return { rx: relZ, rz: -relX };   // 逆時鐘 90 度 (270 度)
        case 0:
        default: return { rx: relX, rz: relZ };   // 方向一致，不旋轉
    }
}

/**
 * 記錄指定區域當前的方塊，作為 Undo 備份
 */
function recordUndoSnapshot(player, minX, maxX, minY, maxY, minZ, maxZ) {
    const dim = player.dimension;
    const snapshot = [];

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const b = dim.getBlock({ x, y, z });
                snapshot.push({
                    pos: { x, y, z },
                    typeId: b ? b.typeId : "minecraft:air",
                    permutation: b ? b.permutation : null
                });
            }
        }
    }
    playerUndoHistory.set(player.id, snapshot);
}

/**
 * 執行 Undo 還原動作
 */
function performUndo(player) {
    const history = playerUndoHistory.get(player.id);
    if (!history || history.length === 0) {
        player.sendMessage("§c[錯誤] 目前沒有可以復原 (Undo) 的動作記錄！");
        return;
    }

    const dim = player.dimension;
    let count = 0;

    for (const item of history) {
        try {
            const block = dim.getBlock(item.pos);
            if (block) {
                if (item.permutation) {
                    block.setPermutation(item.permutation);
                } else {
                    block.setType(item.typeId);
                }
                count++;
            }
        } catch (e) {}
    }

    playerUndoHistory.delete(player.id);
    player.sendMessage(`§a[復原成功] 已還原 ${count} 個方塊至操作前的狀態！`);
}

// ==========================================
// 3. 全息 3D 實體管理邏輯 (修復材質異常)
// ==========================================

function clearHologramEntities(pId, player = null) {
    if (activeHologramEntities.has(pId)) {
        const list = activeHologramEntities.get(pId);
        for (const entity of list) {
            if (entity && entity.isValid()) {
                try { entity.remove(); } catch (e) {}
            }
        }
        activeHologramEntities.set(pId, []);
    }

    if (player && player.isValid()) {
        try {
            const entities = player.dimension.getEntities({
                type: "custom:hologram_block",
                location: player.location,
                maxDistance: 96
            });
            for (const e of entities) {
                try { e.remove(); } catch (err) {}
            }
        } catch (e) {}
    }
}

function refreshHologramEntities(player, preview) {
    const pId = player.id;
    clearHologramEntities(pId, player);

    const { origin, size, blocks, rotation, layerFilter } = preview;
    const dim = player.dimension;
    const createdEntities = [];

    for (const b of blocks) {
        if (layerFilter !== -1 && b.relY !== layerFilter) continue;
        if (!b.typeId || b.typeId === "minecraft:air") continue;

        const rotated = rotateRelCoords(b.relX, b.relZ, size.x, size.z, rotation);
        const worldX = origin.x + rotated.rx;
        const worldY = origin.y + b.relY;
        const worldZ = origin.z + rotated.rz;

        const currentBlock = dim.getBlock({ x: worldX, y: worldY, z: worldZ });
        if (currentBlock && currentBlock.typeId === b.typeId) continue;

        try {
            // 生成基底全息實體
            const holo = dim.spawnEntity("custom:hologram_block", {
                x: worldX + 0.5,
                y: worldY,
                z: worldZ + 0.5
            });

            createdEntities.push(holo);

            // 依實際方塊 typeId 設定材質索引 entity property，
            // render controller 會依此索引切換成對應的貼圖陣列成員，
            // 使全息投影的材質與被複製/選取的方塊材質一致。
            const geometryId = getBlockGeometryWithFallback(b.typeId);
            const texIndex = getTextureIndexForBlock(geometryId);
            try {
                holo.setProperty("custom:tex_index", texIndex);
            } catch (e) {}

            // 記錄這個全息實體對應投影裡的哪一個相對座標，
            // 讓玩家右鍵點擊這個實體時，能反查出該放哪個真實方塊 (Easy-Place)。
            try {
                holo.setDynamicProperty("bc:relX", b.relX);
                holo.setDynamicProperty("bc:relY", b.relY);
                holo.setDynamicProperty("bc:relZ", b.relZ);
                holo.setDynamicProperty("bc:ownerId", player.id);
            } catch (e) {}

        } catch (e) {}
    }

    activeHologramEntities.set(pId, createdEntities);
}

world.beforeEvents.playerLeave.subscribe((event) => {
    if (event.player) {
        clearHologramEntities(event.player.id, event.player);
        clearPlayerBorder(event.player.id);
    }
});

// ==========================================
// 4. 事件監聽 (Event Handlers)
// ==========================================

function handleToolInteraction(player, item, hitBlock, face) {
    if (!player || !item) return;
    const itemTypeId = item.typeId;

    if (itemTypeId === "custom:block_counter_selector") {
        if (!hitBlock) {
            const viewHit = player.getBlockFromViewDirection({ maxDistance: 7 });
            hitBlock = viewHit?.block;
            if (face === undefined) face = viewHit?.face;
        }
        if (!hitBlock) {
            player.sendMessage("§c[提示] 未瞄準任何方塊，請靠近方塊後再按右鍵！");
            return;
        }

        const blockPos = { 
            x: Math.floor(hitBlock.location.x), 
            y: Math.floor(hitBlock.location.y), 
            z: Math.floor(hitBlock.location.z) 
        };
        const pId = player.id;

        if (playerClipboards.has(pId) && !player.isSneaking) {
            // 不蹲下的右鍵 = 設定/更新投影目標起點。
            // 蹲下右鍵永遠保留給 P1/P2 選區使用 (即使剪貼簿已經有資料)，
            // 這樣你才能隨時蹲下重新框選/測量別的區域，
            // 不會不小心把蹲下點擊也誤判成「投影放出」，
            // 導致舊投影跟新框選的區域疊在一起變成破圖。
            const clip = playerClipboards.get(pId);
            const currentDirection = getPlayerCardinalDirection(player);
            const sourceDirection = clip.sourceDirection ?? 0;
            // 用「目前面向」與「複製當下面向」的差值來旋轉，
            // 這樣只要貼上時跟複製時面向同一個方向，角度差=0，完全不旋轉。
            const rotationDifference = (currentDirection - sourceDirection + 4) % 4;
            // 用點擊面偏移，讓結構「蓋在」點擊的方塊之上/外側，
            // 而不是直接嵌入該方塊本身 (修正投影高度低了一格的問題)
            const targetPos = applyFaceOffset(blockPos, face);
            setPlacementTarget(player, targetPos, rotationDifference);
            return;
        }

        if (!player.isSneaking) {
            player.sendMessage("§e[提示] 請「蹲下 + 按右鍵」點擊方塊記錄 P1 / P2 座標！");
            return;
        }

        let sel = playerSelections.get(pId) || {};
        
        if (!sel.p1 || (sel.p1 && sel.p2)) {
            clearPlayerBorder(pId);
            clearHologramEntities(pId, player);
            
            sel = { p1: blockPos, p2: null };
            playerSelections.set(pId, sel);
            
            player.sendMessage(`§a[P1 已設定] §7(${blockPos.x}, ${blockPos.y}, ${blockPos.z})`);
            player.sendMessage(`§e▶ 請繼續對第二個方塊「蹲下+右鍵」來設定 P2...`);
        } else {
            sel.p2 = blockPos;
            playerSelections.set(pId, sel);
            
            player.sendMessage(`§a[P2 已設定] §7(${blockPos.x}, ${blockPos.y}, ${blockPos.z})`);
            
            startBorderParticles(player, sel.p1, sel.p2);
            system.run(() => countBlocks(player, sel.p1, sel.p2));
        }
        return;
    }

    if (itemTypeId === "custom:block_counter_checker") {
        if (!hitBlock) {
            hitBlock = player.getBlockFromViewDirection({ maxDistance: 7 })?.block;
        }
        system.run(() => checkContainerOrArea(player, hitBlock));
        return;
    }

    if (itemTypeId === "custom:block_counter_tool") {
        system.run(() => openMainMenu(player));
    }
}

world.afterEvents.itemUse.subscribe((event) => {
    try { handleToolInteraction(event.source, event.itemStack, null, undefined); } catch (e) {}
});

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    try { handleToolInteraction(event.player, event.itemStack, event.block, event.face); } catch (e) {}
});

// ==========================================
// 5. 複製、貼上與座標精確對齊
// ==========================================

function copyArea(player, p1, p2) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = getMinMax(p1, p2);
    const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);

    if (volume > MAX_BLOCK_LIMIT) {
        player.sendMessage(`§c[錯誤] 選區體積超過上限 (${volume} > ${MAX_BLOCK_LIMIT})！`);
        return;
    }

    const dim = player.dimension;
    const blocks = [];

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const b = dim.getBlock({ x, y, z });
                if (b && !b.isAir) {
                    blocks.push({
                        relX: x - minX,
                        relY: y - minY,
                        relZ: z - minZ,
                        typeId: b.typeId,
                        permutation: b.permutation
                    });
                }
            }
        }
    }

    const clipboardData = {
        size: {
            x: maxX - minX + 1,
            y: maxY - minY + 1,
            z: maxZ - minZ + 1
        },
        blocks: blocks,
        // 記錄複製當下玩家面向的方向，貼上時要用「目前方向 - 這個方向」的差值
        // 來旋轉，而不是直接套用貼上當下的絕對方向，否則複製與貼上時
        // 只要朝向剛好不是「南(0)」，即使貼上時面向跟複製時完全相同，
        // 也會被誤判成需要旋轉，導致投影無故轉了 90 度。
        sourceDirection: getPlayerCardinalDirection(player)
    };

    playerClipboards.set(player.id, clipboardData);
    player.sendMessage(`§a[系統] 已成功複製區域！共包含 ${blocks.length} 個方塊。`);
    player.sendMessage(`§e▶ 請拿「選區工具」對目標位置右鍵，即可確定貼上起點！`);
}

// ==========================================
// 5-1. 生存模式：依背包材料自動建造投影
// ==========================================

function isPlayerInSurvival(player) {
    try {
        if (typeof player.getGameMode === "function") {
            return player.getGameMode() === GameMode.Survival;
        }
    } catch (e) {}
    try {
        const found = player.dimension.getPlayers({
            gameMode: GameMode.Survival,
            location: player.location,
            maxDistance: 3
        });
        return found.some((p) => p.id === player.id);
    } catch (e) {
        return false;
    }
}

/**
 * 嘗試用背包裡的材料，放置「一個」指定的投影方塊。
 * 成功會實際改變世界方塊、扣掉 1 個背包物品，並回傳 true；
 * 背包沒有材料或發生錯誤則回傳 false，投影原封不動保留。
 * 這個函式是「手動點擊放置」跟「一鍵由下而上建造」共用的核心邏輯。
 */
function placeOneBlockFromInventory(player, container, dim, b, rotation, origin) {
    if (!b.typeId || b.typeId === "minecraft:air") return false;

    const rotated = rotateRelCoords(b.relX, b.relZ, 0, 0, rotation);
    const worldX = origin.x + rotated.rx;
    const worldY = origin.y + b.relY;
    const worldZ = origin.z + rotated.rz;

    const currentBlock = dim.getBlock({ x: worldX, y: worldY, z: worldZ });
    if (!currentBlock) return false;
    if (currentBlock.typeId === b.typeId) return true; // 已經是正確方塊，視為已完成

    // 在背包中尋找相符的方塊物品
    let slotIndex = -1;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === b.typeId) { slotIndex = i; break; }
    }
    if (slotIndex === -1) return false; // 背包沒有這個材料

    try {
        const rotatedPermutation = b.permutation ? rotatePermutation(b.permutation, rotation) : null;
        if (rotatedPermutation) {
            currentBlock.setPermutation(rotatedPermutation);
        } else {
            currentBlock.setType(b.typeId);
        }

        const item = container.getItem(slotIndex);
        if (item.amount > 1) {
            item.amount -= 1;
            container.setItem(slotIndex, item);
        } else {
            container.setItem(slotIndex, undefined);
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Litematica「Easy-Place」互動模式：玩家自己右鍵點擊某一格全息投影，
 * 才會用背包材料放置「那一格」，不會自動掃描全部投影。
 */
function tryPlaceSingleHologramBlock(player, holoEntity) {
    if (!isPlayerInSurvival(player)) {
        player.sendMessage("§c[提示] 只有生存模式才能用背包材料放置投影方塊！");
        return;
    }

    const pId = player.id;
    const preview = playerPreviews.get(pId);
    if (!preview) return;

    let relX, relY, relZ;
    try {
        relX = holoEntity.getDynamicProperty("bc:relX");
        relY = holoEntity.getDynamicProperty("bc:relY");
        relZ = holoEntity.getDynamicProperty("bc:relZ");
    } catch (e) { return; }
    if (relX === undefined || relY === undefined || relZ === undefined) return;

    const idx = preview.blocks.findIndex(bb => bb.relX === relX && bb.relY === relY && bb.relZ === relZ);
    if (idx === -1) return; // 這格可能已經被別的方式蓋掉了
    const b = preview.blocks[idx];

    const invComp = player.getComponent("minecraft:inventory") || player.getComponent(BlockComponentTypes.Inventory);
    if (!invComp || !invComp.container) return;

    const placed = placeOneBlockFromInventory(player, invComp.container, player.dimension, b, preview.rotation, preview.origin);

    if (!placed) {
        player.sendMessage(`§c[提示] 背包裡沒有 ${b.typeId.replace("minecraft:", "")}，無法放置這一格！`);
        return;
    }

    preview.blocks.splice(idx, 1);
    playerPreviews.set(pId, preview);
    refreshHologramEntities(player, preview);
    try { player.playSound("dig.wood", { volume: 0.5, pitch: 1.4 }); } catch (e) {}

    if (preview.blocks.length === 0) {
        player.sendMessage("§a🎉[完成] 投影結構已全部用背包材料建造完成！");
        clearPlayerBorder(pId);
        clearHologramEntities(pId, player);
        playerPreviews.delete(pId);
    }
}

world.afterEvents.playerInteractWithEntity.subscribe((event) => {
    try {
        if (event.target?.typeId === "custom:hologram_block") {
            tryPlaceSingleHologramBlock(event.player, event.target);
        }
    } catch (e) {}
});

/**
 * 選單按鈕用：一次把整個投影「由下而上」自動建造完成 (仍然只消耗背包裡實際擁有的材料，
 * 缺料的格子會照樣保留投影，不會強行跳過中間樓層)。
 * 跟 tryPlaceSingleHologramBlock 的差異：這個是一次處理所有格子，並保證由下往上蓋，
 * 不會出現上層先蓋好、下層還空著的懸空情況。
 */
function buildFromInventoryBottomUp(player, preview) {
    if (!preview || !preview.blocks || preview.blocks.length === 0) {
        player.sendMessage("§c[錯誤] 目前沒有投影可以建造！");
        return;
    }
    if (!isPlayerInSurvival(player)) {
        player.sendMessage("§c[提示] 只有生存模式才能用背包材料自動建造！");
        return;
    }

    const invComp = player.getComponent("minecraft:inventory") || player.getComponent(BlockComponentTypes.Inventory);
    if (!invComp || !invComp.container) return;
    const container = invComp.container;
    const dim = player.dimension;
    const { origin, rotation, layerFilter } = preview;

    // 由下而上排序：relY 小的 (最底層) 排最前面，同一層內用 relZ、relX 排序讓建造順序更穩定
    const ordered = [...preview.blocks].sort((a, c) => {
        if (a.relY !== c.relY) return a.relY - c.relY;
        if (a.relZ !== c.relZ) return a.relZ - c.relZ;
        return a.relX - c.relX;
    });

    const remaining = [];
    let filledCount = 0;

    for (const b of ordered) {
        if (layerFilter !== -1 && b.relY !== layerFilter) { remaining.push(b); continue; }

        const placed = placeOneBlockFromInventory(player, container, dim, b, rotation, origin);
        if (placed) {
            filledCount++;
        } else {
            remaining.push(b);
        }
    }

    if (filledCount > 0) {
        preview.blocks = remaining;
        playerPreviews.set(player.id, preview);
        refreshHologramEntities(player, preview);
        try { player.playSound("random.orb", { volume: 0.5, pitch: 1.2 }); } catch (e) {}
        player.sendMessage(`§a[由下而上建造] 已使用背包材料填入 ${filledCount} 個方塊！`);

        if (preview.blocks.length === 0) {
            player.sendMessage("§a🎉[完成] 投影結構已全部用背包材料建造完成！");
            clearPlayerBorder(player.id);
            clearHologramEntities(player.id, player);
            playerPreviews.delete(player.id);
        }
    } else {
        player.sendMessage("§c[提示] 背包裡沒有找到任何投影需要的材料！");
    }
}

function setPlacementTarget(player, targetPos, rotation = 0) {
    const clip = playerClipboards.get(player.id);
    if (!clip) return;

    const previewData = {
        origin: targetPos,
        size: clip.size,
        blocks: clip.blocks,
        rotation: rotation,
        layerFilter: -1
    };

    playerPreviews.set(player.id, previewData);
    player.sendMessage(`§b[Construct 投影啟動] 基點對齊至：(${targetPos.x}, ${targetPos.y}, ${targetPos.z})`);
    player.sendMessage("§7▶ 生存模式：右鍵點擊全息投影可用背包材料放置該格 (Easy-Place)，或用選單「由下而上」一次建造。");

    startConstructProjection(player, previewData);
}

function startConstructProjection(player, preview) {
    const pId = player.id;
    clearPlayerBorder(pId);

    refreshHologramEntities(player, preview);

    const { origin, size, rotation } = preview;
    const dim = player.dimension;

    const intervalId = system.runInterval(() => {
        if (!player.isValid()) return clearPlayerBorder(pId);

        const stillPreview = playerPreviews.get(pId);
        if (!stillPreview) return;

        for (const b of stillPreview.blocks) {
            if (stillPreview.layerFilter !== -1 && b.relY !== stillPreview.layerFilter) continue;

            const rotated = rotateRelCoords(b.relX, b.relZ, size.x, size.z, rotation);
            const worldX = origin.x + rotated.rx;
            const worldY = origin.y + b.relY;
            const worldZ = origin.z + rotated.rz;

            const currentBlock = dim.getBlock({ x: worldX, y: worldY, z: worldZ });

            if (currentBlock && !currentBlock.isAir && currentBlock.typeId !== b.typeId) {
                spawnCustomParticle(dim, "minecraft:redstone_ore_dust_particle", worldX + 0.5, worldY + 0.5, worldZ + 0.5);
            }
        }
    }, 15);

    playerIntervals.set(pId, intervalId);
}

function pasteStructure(player) {
    const preview = playerPreviews.get(player.id);
    if (!preview) {
        player.sendMessage("§c[錯誤] 未設定投影目標位置！請先用選區工具右鍵點擊地面。");
        return;
    }

    const dim = player.dimension;
    const { origin, size, rotation, blocks } = preview;

    const minX = origin.x;
    const maxX = origin.x + size.x - 1;
    const minY = origin.y;
    const maxY = origin.y + size.y - 1;
    const minZ = origin.z;
    const maxZ = origin.z + size.z - 1;

    recordUndoSnapshot(player, minX, maxX, minY, maxY, minZ, maxZ);

    let count = 0;
    for (const b of blocks) {
        try {
            const rotated = rotateRelCoords(b.relX, b.relZ, size.x, size.z, rotation);
            const targetBlock = dim.getBlock({
                x: origin.x + rotated.rx,
                y: origin.y + b.relY,
                z: origin.z + rotated.rz
            });

            if (targetBlock) {
                if (b.permutation) {
                    // 依貼上時選擇的旋轉角度，把方塊自身的朝向(門/樓梯/原木等)一併轉正
                    targetBlock.setPermutation(rotatePermutation(b.permutation, rotation));
                } else {
                    targetBlock.setType(b.typeId);
                }
                count++;
            }
        } catch (e) {}
    }

    player.sendMessage(`§a[系統] 已成功貼上結構！共放置 ${count} 個方塊。`);
    player.sendMessage(`§e💡 若貼錯位置，可打開選單點擊「↩️ 復原 (Undo) 上一次操作」。`);

    clearPlayerBorder(player.id);
    clearHologramEntities(player.id, player);
    playerPreviews.delete(player.id);
}

function spawnCustomParticle(dimension, particleName, x, y, z) {
    try { dimension.spawnParticle(particleName, { x, y, z }); } catch (e) {}
}

// ==========================================
// 6. 統計與物資比對系統
// ==========================================

function getAreaBlockCounts(player, p1, p2) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = getMinMax(p1, p2);

    const length = maxX - minX + 1;
    const height = maxY - minY + 1;
    const width = maxZ - minZ + 1;
    const volume = length * height * width;

    if (volume > MAX_BLOCK_LIMIT) {
        player.sendMessage(`§c[警告] 選區體積超過安全限制 ${MAX_BLOCK_LIMIT} 方塊！`);
        return { counts: {}, layerCounts: {}, info: { length: 0, height: 0, width: 0, volume: 0, minY: 0, maxY: 0 } };
    }

    const filterList = getPlayerFilterList(player.id);
    const dimension = player.dimension;
    const counts = {};
    const layerCounts = {}; 

    for (let y = minY; y <= maxY; y++) {
        layerCounts[y] = {};
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const b = dimension.getBlock({ x, y, z });
                if (b) {
                    const type = b.typeId;
                    if (filterList.includes(type)) continue;

                    counts[type] = (counts[type] || 0) + 1;
                    layerCounts[y][type] = (layerCounts[y][type] || 0) + 1;
                }
            }
        }
    }

    return { counts, layerCounts, info: { length, height, width, volume, minY, maxY } };
}

function checkContainerOrArea(player, targetBlock) {
    const sel = playerSelections.get(player.id);
    if (!sel || !sel.p1 || !sel.p2) {
        player.sendMessage("§c[錯誤] 請先使用「選區工具」設定 P1 與 P2 區域！");
        return;
    }

    const { counts: requiredCounts } = getAreaBlockCounts(player, sel.p1, sel.p2);
    const containerCounts = {};

    const invComp = player.getComponent("minecraft:inventory") || player.getComponent(BlockComponentTypes.Inventory);
    if (invComp && invComp.container) {
        const c = invComp.container;
        for (let i = 0; i < c.size; i++) {
            const item = c.getItem(i);
            if (item) containerCounts[item.typeId] = (containerCounts[item.typeId] || 0) + item.amount;
        }
    }

    if (targetBlock && isContainer(targetBlock.typeId)) {
        try {
            const containerComp = targetBlock.getComponent("minecraft:inventory") || targetBlock.getComponent(BlockComponentTypes.Inventory);
            if (containerComp && containerComp.container) {
                const c = containerComp.container;
                for (let i = 0; i < c.size; i++) {
                    const item = c.getItem(i);
                    if (item) containerCounts[item.typeId] = (containerCounts[item.typeId] || 0) + item.amount;
                }
            }
        } catch (e) {}
    }

    let reportText = "§1====================\n§q📦 §l物資缺料比對報告§r\n§1====================\n\n";
    const missingItems = {};
    let totalMissing = 0;

    for (const [typeId, reqAmount] of Object.entries(requiredCounts)) {
        const totalHas = containerCounts[typeId] || 0;
        const missing = reqAmount - totalHas;
        const cleanName = typeId.replace("minecraft:", "");

        if (missing <= 0) {
            reportText += `§a✔ ${cleanName}: 物資充足\n   §7├ 需求: ${formatItemAmount(reqAmount)} | 現有: ${formatItemAmount(totalHas)}\n\n`;
        } else {
            missingItems[typeId] = missing;
            totalMissing += missing;
            reportText += `§c✖ ${cleanName}: 缺少 ${formatItemAmount(missing)}\n   §7├ 需求: ${formatItemAmount(reqAmount)} | 現有: ${formatItemAmount(totalHas)}\n\n`;
        }
    }

    if (totalMissing === 0) {
        reportText += "§a🎉 當前持有物資完全足夠建造此區域！";
    } else {
        reportText += `§e⚠️ 總共缺少: ${formatItemAmount(totalMissing)}`;
    }

    const isOpUser = checkIsOp(player);
    const form = new ActionFormData();
    form.title("缺料比對結果");
    form.body(reportText);
    form.button("確定");
    form.button("📢 發送報告到聊天室");
    if (isOpUser) form.button("⚡ [OP] 一鍵補齊缺料物品");

    safeShowForm(player, form, (res) => {
        if (res.selection === 1) {
            world.sendMessage(`§e[${player.name} 的建材缺料清單]\n` + reportText.replace(/§[0-9a-fk-r]/g, ""));
        } else if (res.selection === 2 && isOpUser) {
            giveMissingItems(player, missingItems);
        }
    });
}

function giveMissingItems(player, missingItems) {
    const invComp = player.getComponent("minecraft:inventory") || player.getComponent(BlockComponentTypes.Inventory);
    if (!invComp || !invComp.container) return;

    let count = 0;
    for (const [typeId, missingAmount] of Object.entries(missingItems)) {
        let amountLeft = missingAmount;
        while (amountLeft > 0) {
            const giveAmount = Math.min(amountLeft, 64);
            try {
                const item = new ItemStack(typeId, giveAmount);
                invComp.container.addItem(item);
            } catch (e) { break; }
            amountLeft -= giveAmount;
        }
        count++;
    }
    player.sendMessage(`§a[系統] 已成功補齊 ${count} 種缺失材料至背包！`);
}

// ==========================================
// 7. 使用者介面選單 (含 Undo)
// ==========================================

function openMainMenu(player) {
    if (!player) return;
    const sel = playerSelections.get(player.id) || {};
    const clip = playerClipboards.get(player.id);
    const preview = playerPreviews.get(player.id);
    const hasUndo = playerUndoHistory.has(player.id);

    const p1Text = sel.p1 ? `${sel.p1.x}, ${sel.p1.y}, ${sel.p1.z}` : "未設定";
    const p2Text = sel.p2 ? `${sel.p2.x}, ${sel.p2.y}, ${sel.p2.z}` : "未設定";
    const clipText = clip ? `已複製 (${clip.blocks.length} 個方塊)` : "無";
    const rotText = preview ? `${(preview.rotation % 4 + 4) % 4 * 90}°` : "0°";

    const form = new ActionFormData();
    form.title("方塊統計控制台");
    form.body(`目前座標：\nP1: §a${p1Text}\n§rP2: §a${p2Text}\n剪貼簿狀態：§e${clipText}\n投影角度：§b${rotText}`);

    // 用陣列依序註冊按鈕文字與對應動作，避免手動計算 index 造成錯位。
    const actions = [];

    actions.push({
        label: "📊 方塊統計與分層檢視",
        run: () => {
            if (!sel.p1 || !sel.p2) return player.sendMessage("§c[錯誤] 請先設定 P1 與 P2！");
            countBlocks(player, sel.p1, sel.p2);
        }
    });

    actions.push({
        label: "📋 複製目前區域",
        run: () => {
            if (!sel.p1 || !sel.p2) return player.sendMessage("§c[錯誤] 請先設定 P1 與 P2！");
            copyArea(player, sel.p1, sel.p2);
        }
    });

    if (clip) {
        actions.push({
            label: "📍 手動輸入放置起點座標",
            run: () => openPlacementCoordForm(player)
        });
    }

    if (preview) {
        actions.push({
            label: "🥞 切換分層顯示 (Layer Mode)",
            run: () => openLayerSelectMenu(player, preview)
        });
        actions.push({
            label: `🔄 旋轉投影角度 (目前 ${rotText})`,
            run: () => rotatePreviewInPlace(player, preview)
        });
        actions.push({
            label: "✨ 一鍵貼上/建置結構",
            run: () => pasteStructure(player)
        });
        actions.push({
            label: "🧱 生存模式：用背包材料建造 (由下而上)",
            run: () => buildFromInventoryBottomUp(player, preview)
        });
    }

    if (hasUndo) {
        actions.push({
            label: "↩️ 復原 (Undo) 上一次貼上/編輯",
            run: () => performUndo(player)
        });
    }

    actions.push({
        label: "⚙️ 自訂過濾方塊清單",
        run: () => openFilterMenu(player)
    });
    actions.push({
        label: "✏️ 手動修改座標",
        run: () => openCoordForm(player, sel.p1 || { x: 0, y: 0, z: 0 }, sel.p2 || { x: 0, y: 0, z: 0 })
    });
    actions.push({
        label: "🛠️ 區域編輯 (清空/填滿/替換)",
        run: () => {
            if (!sel.p1 || !sel.p2) return player.sendMessage("§c[錯誤] 請先設定 P1 與 P2！");
            openAreaEditForm(player, sel.p1, sel.p2);
        }
    });
    actions.push({
        label: "🗑️ 清除選區與投影",
        run: () => {
            playerSelections.delete(player.id);
            playerClipboards.delete(player.id);
            playerPreviews.delete(player.id);
            clearPlayerBorder(player.id);
            clearHologramEntities(player.id, player);
            player.sendMessage("§e[系統] 已清除所有座標與投影狀態，蹲下+右鍵可重新框選 P1/P2。");
        }
    });

    for (const action of actions) form.button(action.label);

    safeShowForm(player, form, (res) => {
        const action = actions[res.selection];
        if (action) action.run();
    });
}

/**
 * 在原地把目前投影角度切換到下一個 90 度增量 (0 -> 90 -> 180 -> 270 -> 0)，
 * 不需要玩家重新站位、重新面向，馬上刷新全息實體。
 */
function rotatePreviewInPlace(player, preview) {
    if (!preview) return;
    preview.rotation = ((preview.rotation ?? 0) + 1) % 4;
    playerPreviews.set(player.id, preview);
    refreshHologramEntities(player, preview);
    player.sendMessage(`§b[投影] 已旋轉至 ${preview.rotation * 90}°`);
    // 注意：這裡故意「不」自動重新打開選單。
    // ActionFormData 選單是全螢幕的，選完按鈕後會先自動關閉；
    // 如果馬上呼叫 openMainMenu() 重開，玩家會完全看不到世界中
    // 全息投影其實已經即時旋轉了 (選單瞬間又蓋滿畫面)，
    // 感覺就像「按了沒反應」。拿掉這行，讓玩家能實際看到
    // 全息投影在原地旋轉，跟 Litematica 一樣；要做其他操作
    // 再用工具重新開一次選單即可。
}

/**
 * 讓玩家直接輸入 X Y Z 座標，把投影起點設定在該座標，
 * 不需要親自走到該處點擊方塊。
 */
function openPlacementCoordForm(player) {
    const clip = playerClipboards.get(player.id);
    if (!clip) return player.sendMessage("§c[錯誤] 請先複製一個區域，剪貼簿才有結構可以放置！");

    const preview = playerPreviews.get(player.id);
    const fallback = preview ? preview.origin : player.location;

    const form = new ModalFormData();
    form.title("手動輸入放置起點座標");
    form.textField("X 座標", "例如：100", String(Math.floor(fallback.x)));
    form.textField("Y 座標", "例如：-60", String(Math.floor(fallback.y)));
    form.textField("Z 座標", "例如：200", String(Math.floor(fallback.z)));

    safeShowForm(player, form, (res) => {
        if (res.canceled || !res.formValues) return;
        const [xStr, yStr, zStr] = res.formValues;
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);
        const z = parseInt(zStr, 10);

        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
            player.sendMessage("§c[錯誤] 座標必須是整數！");
            return;
        }

        const rotation = preview ? preview.rotation : 0;
        setPlacementTarget(player, { x, y, z }, rotation);
    });
}

function showResult(player, total, counts, layerCounts, info) {
    let body = `📐 區域體積：${info.length} × ${info.width} × ${info.height} (共 ${info.volume} 方塊)\n`;
    body += `🧱 方塊總數：${formatItemAmount(total)}\n--------------------\n`;

    for (const [type, num] of Object.entries(counts)) {
        body += `${type.replace("minecraft:", "")}: ${formatItemAmount(num)}\n`;
    }

    const form = new ActionFormData();
    form.title("方塊統計結果");
    form.body(body);
    form.button("確定");
    form.button("📋 複製目前區域");
    form.button("🥞 查看 Y 軸分層數據");
    form.button("📢 發送總清單至聊天室");

    safeShowForm(player, form, (res) => {
        if (res.selection === 1) {
            const sel = playerSelections.get(player.id);
            if (sel && sel.p1 && sel.p2) copyArea(player, sel.p1, sel.p2);
        } else if (res.selection === 2) {
            showLayerResult(player, layerCounts, info);
        } else if (res.selection === 3) {
            world.sendMessage(`§e[${player.name} 的區域建材清單]\n` + body.replace(/§[0-9a-fk-r]/g, ""));
        }
    });
}

function openLayerSelectMenu(player, preview) {
    let currentLayer = preview.layerFilter;
    const maxLayer = preview.size.y - 1;

    let statusText = currentLayer === -1 
        ? "🌐 當前狀態：§a顯示全部層級 (All Layers)§r" 
        : `🥞 當前狀態：§e僅顯示第 ${currentLayer + 1} 層 / 共 ${preview.size.y} 層 (Y + ${currentLayer})§r`;

    const form = new ActionFormData();
    form.title("分層顯示設定");
    form.body(`${statusText}\n\n請點擊下方按鈕進行調整：`);

    form.button("⬆️ 向上一層");
    form.button("⬇️ 向下一層");
    form.button(currentLayer === -1 ? "🔲 切換為：單層顯示 (第 1 層)" : "🌐 切換為：顯示全部");
    form.button("❌ 關閉選單");

    safeShowForm(player, form, (res) => {
        const btnIndex = res.selection;

        if (btnIndex === 0) {
            currentLayer = currentLayer === -1 ? 0 : Math.min(currentLayer + 1, maxLayer);
        } else if (btnIndex === 1) {
            currentLayer = currentLayer === -1 ? maxLayer : Math.max(currentLayer - 1, 0);
        } else if (btnIndex === 2) {
            currentLayer = currentLayer === -1 ? 0 : -1;
        } else {
            return player.sendMessage("§a[系統] 已完成分層顯示設定。");
        }

        preview.layerFilter = currentLayer;
        playerPreviews.set(player.id, preview);
        refreshHologramEntities(player, preview);
        openLayerSelectMenu(player, preview);
    });
}

function openFilterMenu(player) {
    const filterList = getPlayerFilterList(player.id);
    let body = "🚫 §l當前過濾不統計的方塊：§r\n--------------------\n";
    filterList.forEach((id, index) => {
        body += `${index + 1}. ${id.replace("minecraft:", "")}\n`;
    });

    const form = new ActionFormData();
    form.title("設定過濾方塊");
    form.body(body);
    form.button("➕ 新增過濾方塊");
    form.button("➖ 移除過濾方塊");
    form.button("🔄 重置為預設清單");
    form.button("返回主選單");

    safeShowForm(player, form, (res) => {
        if (res.selection === 0) {
            openAddFilterForm(player);
        } else if (res.selection === 1) {
            openRemoveFilterForm(player);
        } else if (res.selection === 2) {
            playerFilterLists.set(player.id, [...DEFAULT_FILTER_LIST]);
            player.sendMessage("§a[設定] 過濾清單已重置！");
            openFilterMenu(player);
        } else if (res.selection === 3) {
            openMainMenu(player);
        }
    });
}

function openAddFilterForm(player) {
    const form = new ModalFormData();
    form.title("新增過濾方塊");
    form.textField("輸入要過濾的方塊 ID", "minecraft:glass", "glass");

    safeShowForm(player, form, (res) => {
        let input = res.formValues[0].trim();
        if (!input) return;
        if (!input.includes(":")) input = "minecraft:" + input;

        const list = getPlayerFilterList(player.id);
        if (!list.includes(input)) {
            list.push(input);
            player.sendMessage(`§a[設定] 已將 ${input} 加入過濾清單！`);
        }
        openFilterMenu(player);
    });
}

function openRemoveFilterForm(player) {
    const list = getPlayerFilterList(player.id);
    if (list.length === 0) return openFilterMenu(player);

    const form = new ModalFormData();
    form.title("移除過濾方塊");
    form.dropdown("選擇要移除的過濾方塊：", list.map(item => item.replace("minecraft:", "")));

    safeShowForm(player, form, (res) => {
        const removedItem = list.splice(res.formValues[0], 1);
        player.sendMessage(`§e[設定] 已移除 ${removedItem}！`);
        openFilterMenu(player);
    });
}

function showLayerResult(player, layerCounts, info) {
    let body = "§lY 軸分層數據：§r\n--------------------\n";
    for (let y = info.minY; y <= info.maxY; y++) {
        const lData = layerCounts[y];
        if (!lData) continue;
        const items = Object.entries(lData);
        if (items.length === 0) continue;

        body += `§e[Y = ${y}]§r\n`;
        for (const [type, num] of items) {
            body += ` ├ ${type.replace("minecraft:", "")}: ${num} 個\n`;
        }
        body += "\n";
    }

    const form = new ActionFormData();
    form.title("Y 軸分層數據");
    form.body(body);
    form.button("返回主統計");

    safeShowForm(player, form, () => {
        const sel = playerSelections.get(player.id);
        if (!sel || !sel.p1 || !sel.p2) return;
        const { counts, layerCounts: lc, info: inf } = getAreaBlockCounts(player, sel.p1, sel.p2);
        let total = 0;
        for (const num of Object.values(counts)) total += num;
        showResult(player, total, counts, layerCounts, info);
    });
}

// ==========================================
// 8. 區域編輯 (Fill / Replace / Clear)
// ==========================================

function openAreaEditForm(player, p1, p2) {
    const form = new ActionFormData();
    form.title("🛠️ 區域編輯工具");
    form.body("警告：此操作將會直接變更世界中的方塊！");
    form.button("🗑️ 清空選區 (清為空氣)");
    form.button("🧱 填滿選區 (Fill)");
    form.button("🔄 替換特定方塊 (Replace)");

    safeShowForm(player, form, (res) => {
        if (res.selection === 0) {
            executeFill(player, p1, p2, "minecraft:air");
        } else if (res.selection === 1) {
            openBlockInputForm(player, "填滿區域", (blockId) => {
                executeFill(player, p1, p2, blockId);
            });
        } else if (res.selection === 2) {
            openReplaceForm(player, p1, p2);
        }
    });
}

function openBlockInputForm(player, title, onConfirm) {
    const form = new ModalFormData();
    form.title(title);
    form.textField("輸入目標方塊 ID", "minecraft:stone", "stone");
    
    safeShowForm(player, form, (res) => {
        let raw = res.formValues[0].trim();
        if (!raw.includes(":")) raw = "minecraft:" + raw;
        onConfirm(raw);
    });
}

function openReplaceForm(player, p1, p2) {
    const form = new ModalFormData();
    form.title("替換特定方塊");
    form.textField("要被換掉的方塊 (Target)", "minecraft:dirt", "dirt");
    form.textField("替換成的新方塊 (New)", "minecraft:stone", "stone");

    safeShowForm(player, form, (res) => {
        let target = res.formValues[0].trim();
        let newBlock = res.formValues[1].trim();
        if (!target.includes(":")) target = "minecraft:" + target;
        if (!newBlock.includes(":")) newBlock = "minecraft:" + newBlock;

        executeReplace(player, p1, p2, target, newBlock);
    });
}

function executeFill(player, p1, p2, blockTypeId) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = getMinMax(p1, p2);

    recordUndoSnapshot(player, minX, maxX, minY, maxY, minZ, maxZ);

    const dim = player.dimension;
    let count = 0;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                try {
                    dim.getBlock({ x, y, z })?.setType(blockTypeId);
                    count++;
                } catch (e) {}
            }
        }
    }
    player.sendMessage(`§a[系統] 已將 ${count} 個方塊設定為 ${blockTypeId}！`);
    player.sendMessage(`§e💡 可在主選單點擊「↩️ 復原 (Undo)」復原此操作。`);
}

function executeReplace(player, p1, p2, targetId, newId) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = getMinMax(p1, p2);

    recordUndoSnapshot(player, minX, maxX, minY, maxY, minZ, maxZ);

    const dim = player.dimension;
    let count = 0;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                try {
                    const b = dim.getBlock({ x, y, z });
                    if (b && b.typeId === targetId) {
                        b.setType(newId);
                        count++;
                    }
                } catch (e) {}
            }
        }
    }
    player.sendMessage(`§a[系統] 已將 ${count} 個 ${targetId} 替換為 ${newId}！`);
    player.sendMessage(`§e💡 可在主選單點擊「↩️ 復原 (Undo)」復原此操作。`);
}

function openCoordForm(player, p1, p2) {
    const form = new ModalFormData();
    form.title("手動設定座標");
    form.textField("[P1 座標] (x y z)", "例如: 10 -60 15", `${p1.x} ${p1.y} ${p1.z}`);
    form.textField("[P2 座標] (x y z)", "例如: 20 -50 25", `${p2.x} ${p2.y} ${p2.z}`);

    safeShowForm(player, form, response => {
        const [p1Str, p2Str] = response.formValues;
        const parsePos = (str) => {
            const parts = str.trim().split(/\s+/).map(Number);
            if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
                return { x: parts[0], y: parts[1], z: parts[2] };
            }
            return null;
        };

        const pos1 = parsePos(p1Str);
        const pos2 = parsePos(p2Str);
        if (!pos1 || !pos2) return player.sendMessage("§c[錯誤] 座標格式不正確！");

        playerSelections.set(player.id, { p1: pos1, p2: pos2 });
        startBorderParticles(player, pos1, pos2);
        countBlocks(player, pos1, pos2);
    });
}

function countBlocks(player, p1, p2) {
    const { counts, layerCounts, info } = getAreaBlockCounts(player, p1, p2);
    let total = 0;
    for (const num of Object.values(counts)) total += num;
    showResult(player, total, counts, layerCounts, info);
}

// ==========================================
// 9. 粒子邊框顯示 (Border Particle Effects)
// ==========================================

function startBorderParticles(player, p1, p2) {
    const pId = player.id;
    clearPlayerBorder(pId);

    const { minX, maxX, minY, maxY, minZ, maxZ } = getMinMax(p1, p2);
    const dimension = player.dimension;

    const intervalId = system.runInterval(() => {
        if (!player.isValid()) return clearPlayerBorder(pId);
        
        for (let x = minX; x <= maxX + 1; x += 1) {
            spawnCustomParticle(dimension, "minecraft:villager_happy", x, minY, minZ);
            spawnCustomParticle(dimension, "minecraft:villager_happy", x, maxY + 1, minZ);
            spawnCustomParticle(dimension, "minecraft:villager_happy", x, minY, maxZ + 1);
            spawnCustomParticle(dimension, "minecraft:villager_happy", x, maxY + 1, maxZ + 1);
        }
        
        for (let y = minY; y <= maxY + 1; y += 1) {
            spawnCustomParticle(dimension, "minecraft:villager_happy", minX, y, minZ);
            spawnCustomParticle(dimension, "minecraft:villager_happy", maxX + 1, y, minZ);
            spawnCustomParticle(dimension, "minecraft:villager_happy", minX, y, maxZ + 1);
            spawnCustomParticle(dimension, "minecraft:villager_happy", maxX + 1, y, maxZ + 1);
        }
        
        for (let z = minZ; z <= maxZ + 1; z += 1) {
            spawnCustomParticle(dimension, "minecraft:villager_happy", minX, minY, z);
            spawnCustomParticle(dimension, "minecraft:villager_happy", minX, maxY + 1, z);
            spawnCustomParticle(dimension, "minecraft:villager_happy", maxX + 1, minY, z);
            spawnCustomParticle(dimension, "minecraft:villager_happy", maxX + 1, maxY + 1, z);
        }
    }, 10);

    playerIntervals.set(pId, intervalId);
}

function clearPlayerBorder(pId) {
    if (playerIntervals.has(pId)) {
        system.clearRun(playerIntervals.get(pId));
        playerIntervals.delete(pId);
    }
}