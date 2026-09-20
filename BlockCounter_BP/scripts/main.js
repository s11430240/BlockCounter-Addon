import { 
    world, 
    system, 
    ItemStack, 
    BlockComponentTypes, 
    BlockPermutation 
} from "@minecraft/server";
import { 
    ModalFormData, 
    ActionFormData 
} from "@minecraft/server-ui";

world.sendMessage("§e[系統提示] BlockCounter (材質修復版) 已成功載入！");

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

function rotateRelCoords(relX, relZ, sizeX, sizeZ, rotation) {
    switch (rotation) {
        case 1: return { rx: -relZ, rz: relX };
        case 2: return { rx: -relX, rz: -relZ };
        case 3: return { rx: relZ, rz: -relX };
        case 0:
        default: return { rx: relX, rz: relZ };
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

            // 正確賦予材質 (透過腳本內部動態轉化避免預設退回泥土)
            system.run(() => {
                if (!holo.isValid()) return;
                try {
                    const cleanTypeId = b.typeId.includes(":") ? b.typeId : `minecraft:${b.typeId}`;
                    holo.runCommandAsync(`event entity @s set_block_${cleanTypeId.replace("minecraft:", "")}`).catch(() => {});
                } catch (e) {}
            });

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

function handleToolInteraction(player, item, hitBlock) {
    if (!player || !item) return;
    const itemTypeId = item.typeId;

    if (itemTypeId === "custom:block_counter_selector") {
        if (!hitBlock) {
            hitBlock = player.getBlockFromViewDirection({ maxDistance: 7 })?.block;
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
            const rot = getPlayerCardinalDirection(player);
            setPlacementTarget(player, blockPos, rot);
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
    try { handleToolInteraction(event.source, event.itemStack, null); } catch (e) {}
});

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    try { handleToolInteraction(event.player, event.itemStack, event.block); } catch (e) {}
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
        blocks: blocks
    };

    playerClipboards.set(player.id, clipboardData);
    player.sendMessage(`§a[系統] 已成功複製區域！共包含 ${blocks.length} 個方塊。`);
    player.sendMessage(`§e▶ 請拿「選區工具」對目標位置右鍵，即可確定貼上起點！`);
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

        const activePreview = playerPreviews.get(pId) || preview;

        for (const b of activePreview.blocks) {
            if (activePreview.layerFilter !== -1 && b.relY !== activePreview.layerFilter) continue;

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
                    targetBlock.setPermutation(b.permutation);
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

    const form = new ActionFormData();
    form.title("方塊統計控制台");
    form.body(`目前座標：\nP1: §a${p1Text}\n§rP2: §a${p2Text}\n剪貼簿狀態：§e${clipText}`);
    
    form.button("📊 方塊統計與分層檢視");
    form.button("📋 複製目前區域");
    
    if (preview) {
        form.button("🥞 切換分層顯示 (Layer Mode)");
        form.button("✨ 一鍵貼上/建置結構");
    }

    if (hasUndo) {
        form.button("↩️ 復原 (Undo) 上一次貼上/編輯");
    }

    form.button("⚙️ 自訂過濾方塊清單");
    form.button("✏️ 手動修改座標");
    form.button("🛠️ 區域編輯 (清空/填滿/替換)");
    form.button("🗑️ 清除選區與投影");

    safeShowForm(player, form, (res) => {
        let btnIndex = res.selection;

        if (btnIndex === 0) {
            if (!sel.p1 || !sel.p2) return player.sendMessage("§c[錯誤] 請先設定 P1 與 P2！");
            countBlocks(player, sel.p1, sel.p2);
        } else if (btnIndex === 1) {
            if (!sel.p1 || !sel.p2) return player.sendMessage("§c[錯誤] 請先設定 P1 與 P2！");
            copyArea(player, sel.p1, sel.p2);
        } else if (preview && btnIndex === 2) {
            openLayerSelectMenu(player, preview);
        } else if (preview && btnIndex === 3) {
            pasteStructure(player);
        } else {
            let offset = 2;
            if (preview) offset += 2;
            if (hasUndo && btnIndex === offset) {
                performUndo(player);
                return;
            }
            if (hasUndo) offset += 1;

            if (btnIndex === offset) {
                openFilterMenu(player);
            } else if (btnIndex === offset + 1) {
                openCoordForm(player, sel.p1 || { x: 0, y: 0, z: 0 }, sel.p2 || { x: 0, y: 0, z: 0 });
            } else if (btnIndex === offset + 2) {
                if (!sel.p1 || !sel.p2) return player.sendMessage("§c[錯誤] 請先設定 P1 與 P2！");
                openAreaEditForm(player, sel.p1, sel.p2);
            } else if (btnIndex === offset + 3) {
                playerSelections.delete(player.id);
                playerClipboards.delete(player.id);
                playerPreviews.delete(player.id);
                clearPlayerBorder(player.id);
                clearHologramEntities(player.id, player);
                player.sendMessage("§e[系統] 已清除所有座標與投影狀態。");
            }
        }
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

    safeShowForm(player, response => {
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