// 名字列表
// 原始的名字列表，用于在重置时恢复names数组
const originalNames = [
    "刘健翔",
    "庞金帅",
    "林晓洁",
    "梁雅诗",
    "谢斌锋",
    "张琳欣",
    "杨博",
    "谢晓",
    "杨哲聪",
    "徐麒",
    "彭威",
    "周丹阳",
    "周丹阳",
    "梁志武",
    "谢嘉兴",
    "曾令轩",
    "曾嘉瑜",
    "吴海汪",
    "施展谋",
    "陈焕",
    "向美芯",
    "汤蕾",
    "郑希怡",
    "乔梓健",
    "钟博文",
    "文小杰",
    "谭智豪",
    "张子欣",
    "胡俊权",
    "朱奕濠",
    "朱奕濠",
    "林淑雯",
    "龚小于",
    "李键朗",
    "谭丽萱",
    "郭广圣",
    "郭广圣",
    "尹晓敏",
    "叶俊熙",
    "骆俐桥",
    "何梓轩",
    "胡浩群",
    "唐贵旭",
    "余俊豪",
    "陈贝琳",
    "陈烁锋",
    "王旭斌",
    "周彦文",
    "陈栎轩",
    "陈栎轩",
    "陈栎轩",
    "吴桐雨",
    "吴一卓",
    "游宁都",
    "游宁都",
    "廖涛",
    "廖涛",
    "廖涛",
    "陈颢中",
    "陈浩斌",
    "李光栩",
    "李光栩",
    "彭根裕",
    "谢宇",
    "梁志武",
];
names = [...originalNames];
// 已抽取的名字列表  
var drawnNames = [];
// 获取显示名字的DOM元素  
var displayBoard = document.getElementById("nameDisplay");
// 获取已抽取人数显示的DOM元素
var drawnCountDisplay = document.getElementById("drawnCount");
// 获取开始抽取按钮的DOM元素  
var drawButton = document.getElementById("drawButton");
// 获取重置按钮的DOM元素  
var resetButton = document.getElementById("resetButton");
// 标记是否正在抽取  
var isDrawing = false;
// 动画效果的时间间隔ID  
var animationInterval = null;

// 开始抽取函数
function startDrawing() {
    if (isDrawing) return;
    isDrawing = true;
    drawButton.innerHTML = "天 选";

    // 开始动画效果，每隔一段时间更换显示的名字  
    animationInterval = setInterval(function () {
        var randomIndex = Math.floor(Math.random() * names.length);
        var randomName = names[randomIndex];
        displayBoard.textContent = randomName; // 更改显示的名字  
    }, 24); // 每隔24毫秒更换一次  

    // 为开始抽取按钮添加事件监听器，但只触发一次
    drawButton.addEventListener("click", function () {
        if (isDrawing) {
            stopDrawing();
        } else {
            startDrawing();
        }
    }, { once: true });

    // 开始抽取时，使重置按钮禁用
    resetButton.disabled = true;
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    clearInterval(animationInterval);
    animationInterval = null;
    drawButton.innerHTML = "启动";

    // 执行实际的抽取并记录结果
    var randomName = getRandomName();
    if (randomName) {
        drawnNames.push(randomName);
        displayBoard.textContent = randomName;
        // 更新已抽取人数的显示
        var drawnCount = drawnNames.length;
        drawnCountDisplay.textContent = "天选: " + drawnCount + "人";
    } else {
        // 如果没有名字可抽取，禁用开始抽取按钮并显示提示信息
        drawButton.disabled = true;
        drawButton.innerHTML = "全员天选"; 
        // 如果没有名字可抽取，隐藏开始抽取和重置按钮
        drawButton.style.display = 'none';
        resetButton.style.display = 'none';
        displayBoard.textContent = "💥";
        resetButton.disabled = false;
    }

    // 仅当成功抽取名字后，才更新侧边栏列表
    if (randomName) {
        var drawnListItems = document.getElementById("drawnListItems");
        var drawnListItem = document.createElement("li");
        drawnListItem.textContent = randomName;
        drawnListItems.appendChild(drawnListItem);
        // 停止抽取后，使重置按钮可用，以便可以清空历史记录
        resetButton.disabled = false;
    }
}


// 从剩余名字中随机抽取一个名字  
function getRandomName() {
    if (names.length === 0) {
        // 如果所有名字都已被抽取，则返回null
        return null;
    }
    // 从未被抽取的名字中随机选择一个索引
    var randomIndex = Math.floor(Math.random() * names.length);
    // 从names数组中移除已被抽取的名字，并获取这个名字
    var randomName = names.splice(randomIndex, 1)[0];
    // 记录抽取的名字
    return randomName; // 返回抽取到的名字
}
// 重置所有功能函数
function resetAll() {
    // 重置names数组为原始名字列表
    names = [...originalNames]; // 使用扩展运算符创建originalNames的浅拷贝并赋值给names
    // 清空已抽取的名字列表
    drawnNames = [];
    // 清空已抽取人数的显示
    drawnCountDisplay.textContent = "天选: 0人";
    // 获取侧边栏列表元素
    var drawnListItems = document.getElementById("drawnListItems");
    // 清空侧边栏的内容
    while (drawnListItems.firstChild) {
        drawnListItems.removeChild(drawnListItems.firstChild);
    }
    // 将显示的名字设置为初始状态: "天 选"
    displayBoard.textContent = "天 选";
    // 清除动画效果
    if (animationInterval !== null) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    // 重置按钮文本为 "启动"
    drawButton.innerHTML = "启动";
    // 设置重置按钮为不可用
    resetButton.disabled = true;
}

// 显示通知的函数
function displayNotification(message) {
    // 创建通知元素
    var notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;

    // 将通知添加到页面中
    document.body.appendChild(notification);

    // 设置定时器，在3秒后移除通知
    setTimeout(function() {
        notification.style.opacity = 0;
        setTimeout(function() {
            document.body.removeChild(notification);
        }, 500); // 0.5秒后移除通知元素
    }, 3000); // 3秒后开始渐隐通知
}

// 修改重置按钮的点击事件监听器，添加检查抽取状态的逻辑
resetButton.addEventListener("click", function(event) {
    event.preventDefault(); // 阻止默认行为，防止按钮做其他操作
    if (isDrawing) {
        // 如果正在抽取，阻止重置操作并显示通知
        displayNotification("请先停止抽取再点击重置");
    } else {
        resetAll();
    }
});

// 最初，重置按钮应该是不可用的
resetButton.disabled = true;

// 为启动按钮添加点击事件监听器（首次绑定）
drawButton.addEventListener("click", startDrawing);