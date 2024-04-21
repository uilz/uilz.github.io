// 初始的名字列表，包含了一些重复的名字
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
];

// 使用展开运算符（spread operator）对originalNames进行浅拷贝，以避免直接修改原始数组
const names = [...originalNames];

// 初始化已抽取的名字列表
var drawnNames = [];

// 使用document.getElementById获取HTML中定义的DOM元素
var displayBoard = document.getElementById("nameDisplay"); // 显示抽取名字的板
var drawnCountDisplay = document.getElementById("drawnCount"); // 显示已抽取人数的元素
var drawButton = document.getElementById("drawButton"); // 开始/停止抽取的按钮
var resetButton = document.getElementById("resetButton"); // 重置所有状态的按钮

// 标记是否正在抽取名字
var isDrawing = false;

// 动画效果的时间间隔ID，用于控制名字显示的动画
var animationInterval = null;

// 开始抽取名字的函数
function startDrawing() {
    // 如果已经在抽取中，则直接返回，避免重复启动
    if (isDrawing) return;

    // 设置抽取状态为true，并更改按钮文本为“天选”
    isDrawing = true;
    drawButton.innerHTML = "天选";

    // 设置动画效果，每隔24毫秒随机更换显示的名字
    animationInterval = setInterval(function () {
        var randomIndex = Math.floor(Math.random() * names.length); // 随机索引
        var randomName = names[randomIndex]; // 随机选中的名字
        displayBoard.textContent = randomName; // 更新显示板的名字
    }, 24);

    // 为开始抽取按钮添加一次性点击事件监听器，用于停止抽取或再次开始抽取
    drawButton.addEventListener("click", function () {
        if (isDrawing) {
            stopDrawing(); // 如果正在抽取，调用stopDrawing停止抽取
        } else {
            startDrawing(); // 如果不在抽取，重新调用startDrawing开始抽取
        }
    }, { once: true });

    // 开始抽取时，使重置按钮可用
    resetButton.disabled = false;

    // 如果没有名字可抽取，禁用开始抽取按钮并显示提示信息
    if (names.length === 0) {
        drawButton.disabled = true;
        drawButton.innerHTML = "全员天选";
        displayBoard.textContent = "！全员天选！";
    }
}

// 停止抽取名字的函数
function stopDrawing() {
    // 如果没有在抽取中，则直接返回
    if (!isDrawing) return;

    // 设置抽取状态为false，清除动画效果
    isDrawing = false;
    clearInterval(animationInterval);
    animationInterval = null;
    // 更改按钮文本为“启动”
    drawButton.innerHTML = "启动";

    // 执行实际的抽取并记录结果
    var randomName = getRandomName();
    if (randomName) {
        // 如果成功抽取了名字，添加到已抽取列表并更新显示
        drawnNames.push(randomName);
        displayBoard.textContent = randomName;
        var drawnCount = drawnNames.length;
        drawnCountDisplay.textContent = "天选: " + drawnCount;
    } else {
        // 如果没有名字可抽取，禁用开始抽取按钮并显示提示信息
        drawButton.disabled = true;
        drawButton.innerHTML = "全员天选";
        displayBoard.textContent = "！全员天选！";
        // 即使没有抽取到名字，也需要使重置按钮可用
        resetButton.disabled = false;
    }

    // 如果成功抽取名字，更新侧边栏列表
    if (randomName) {
        var drawnListItems = document.getElementById("drawnListItems");
        var drawnListItem = document.createElement("li");
        drawnListItem.textContent = randomName;
        drawnListItems.appendChild(drawnListItem);
        // 抽取完成后，使重置按钮可用，以便可以清空历史记录
        resetButton.disabled = false;
    }
}

// 从剩余名字中随机抽取一个名字的函数
function getRandomName() {
    // 如果没有名字剩余，则返回null
    if (names.length === 0) {
        return null;
    }
    // 随机选择一个索引，从未抽取的名字中抽取一个名字
    var randomIndex = Math.floor(Math.random() * names.length);
    var randomName = names.splice(randomIndex, 1)[0];
    // 返回抽取到的名字
    return randomName;
}

// 重置所有功能，恢复到初始状态的函数
function resetAll() {
    // 设置抽取状态为false，清除动画效果
    isDrawing = false;
    // 重置names数组为原始名字列表
    names = [...originalNames];
    // 清空已抽取的名字列表
    drawnNames = [];
    // 清空已抽取人数的显示
    drawnCountDisplay.textContent = "天选: 0人";
    // 获取侧边栏列表元素，并清空其内容
    var drawnListItems = document.getElementById("drawnListItems");
    while (drawnListItems.firstChild) {
        drawnListItems.removeChild(drawnListItems.firstChild);
    }
    // 将显示的名字设置为初始状态，例如 "天✔选"
    displayBoard.textContent = "天✔选";
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

// 为重置按钮添加点击事件监听器，点击时调用resetAll函数
resetButton.addEventListener("click", resetAll);

// 最初，重置按钮应该是不可用的
resetButton.disabled = true;

// 为启动按钮添加点击事件监听器，点击时调用startDrawing函数
drawButton.addEventListener("click", startDrawing);
