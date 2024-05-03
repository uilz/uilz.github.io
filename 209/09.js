// 名字列表
// 原始的名字列表，用于在重置时恢复names数组
const originalNames = [
    "张海丰",
    "唐可儿",
    "陈海玉",
    "刘文珍",
    "张敏玲",
    "卢鹏",
    "陶子萱",
    "罗广",
    "李浩",
    "盛浩峰",
    "陈卓",
    "廖宇阳",
    "李梓里",
    "叶金娜",
    "郑宇胜",
    "邓凯尹",
    "林炳锋",
    "李瑞奇",
    "郭浩鹏",
    "李乐瑶",
    "吴佳欣",
    "程奕涛",
    "李佳玲",
    "黄冠铭",
    "甘亦超",
    "王米柔",
    "刘韬",
    "何穗希",
    "陈锡涛",
    "邓子轩",
    "叶伟杰",
    "梁说恩",
    "林佳琪",
    "陈俊宇",
    "钟欣彤",
    "沈玮宗",
    "余圳威",
    "胡静雯",
    "黄海凝",
    "杨颖德",
    "陈嘉豪",
    "张和",
    "何冠希",
    "李子晴",
    "何冠杰",
    "龙周天伊",
    "陈科昕",
    "林文豪",
    "马永淳",
    "王恒书",
    "陈朗",
    "杨光",
    "钟汶芯",
    "刘俊彦",
    "杨杰",
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

// 返回函数
function back() {
    window.location.href = "/index.html"
}

// 开始抽取函数
function startDrawing() {
    if (isDrawing) return;
    isDrawing = true;
    drawButton.innerHTML = "天 选";
    // 如果没有人可以被抽取
    if (names.length === 0) {
        // 如果没有名字可抽取，隐藏开始抽取
        drawButton.style.display = 'none';
        displayBoard.textContent = "💥";
        isDrawing = false;
    } else {
        // 开始动画效果，每隔一段时间更换显示的名字  
        animationInterval = setInterval(function () {
            var randomIndex = Math.floor(Math.random() * names.length);
            var randomName = names[randomIndex];
            displayBoard.textContent = randomName; // 更改显示的名字  
        }, 14); // 每隔14毫秒更换一次  

        // 为开始抽取按钮添加事件监听器，但只触发一次
        drawButton.addEventListener("click", function () {
            if (isDrawing) {
                stopDrawing();
            } else {
                startDrawing();
            }
        }, { once: true });
    }
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
    }

    // 仅当成功抽取名字后，才更新侧边栏列表
    if (randomName) {
        var drawnListItems = document.getElementById("drawnListItems");
        var drawnListItem = document.createElement("li");
        drawnListItem.textContent = randomName;
        drawnListItems.appendChild(drawnListItem);
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
    // 设置开始按钮可见
    drawButton.style = 'button';
}

// 显示通知的函数
function displayNotification(message) {
    // 创建通知元素
    var notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    // 将通知添加到页面中
    document.body.appendChild(notification);
    // 直接使用类来控制显示和隐藏
    notification.classList.add("show");

    // 设置定时器，在1秒后开始渐隐通知
    setTimeout(function () {
        notification.classList.remove("show"); // 移除类来触发CSS的渐隐效果
        setTimeout(function () {
            document.body.removeChild(notification); // 0.5秒后移除通知元素
        }, 1500); // 1.5秒后完成移除
    }, 900); // 0.9秒后开始渐隐通知
}

document.addEventListener('DOMContentLoaded', function () {
    var resetButton = document.getElementById('resetButton');
    resetButton.addEventListener("click", function (event) {
        event.preventDefault(); // 阻止默认行为
        // 检查是否正在抽取
        if (isDrawing) {
            // 显示通知
            displayNotification("请完成抽取再点重置");
        } else {
            resetAll();
        }
    });
});

// 为启动按钮添加点击事件监听器（首次绑定）
drawButton.addEventListener("click", startDrawing);
// 为返回按钮添加点击事件监听器（首次绑定）
backButton.addEventListener("click", back);