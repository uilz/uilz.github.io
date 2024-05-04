var txtUrl = "/hitokoto-load/quotes.txt"; // 一言文本文件位置

window.onload = function () {
    // // 加载动画
    // setTimeout(function () {
    //     var txloader = document.getElementsByClassName("txloader")[0];
    //     txloader.className = "txloader fadeout";
    //     setTimeout(function () { txloader.style.display = "none" }, 10)
    // }, 10)
    // 一言
    let yiyanContent = document.querySelector(".yiyan-content");
    getYiYan().then(yiyan => revealText(yiyanContent, yiyan, 100)); // 初始文本显示间隔100ms
};
// 一言文本文件位置
var txtUrl = "/hitokoto-load/quotes.txt"; // 使用yiy-load.js中的变量

// 异步函数获取一言
async function getYiYan() {
    try {
        let response = await fetch(txtUrl);
        if (!response.ok) {
            throw new Error("网络响应不正确");
        }
        let text = await response.text();
        let resultArr = text.split('\n');
        let i = Math.floor(Math.random() * resultArr.length);
        return resultArr[i];
    } catch (error) {
        console.error('获取一言时发生错误：', error);
        return "出错了，请稍后再试。";
    }
}

// 逐字显现动画
function revealText(yiyanContent, str, interval) {
    let currentIndex = 0;
    let revealInterval = setInterval(() => {
        if (currentIndex < str.length) {
            yiyanContent.textContent += str[currentIndex++];
        } else {
            clearInterval(revealInterval);
            // 当前一言显示完毕后，等待9.85秒进行消失动画
            setTimeout(() => fadeOutText(yiyanContent, interval), 9850);
        }
    }, interval);
}

// 逐字消失动画
function fadeOutText(yiyanContent, interval) {
    let originalText = yiyanContent.textContent;
    let fadeOutInterval = setInterval(() => {
        if (yiyanContent.textContent.length > 0) {
            yiyanContent.textContent = originalText.slice(0, -1);
            originalText = yiyanContent.textContent;
        } else {
            clearInterval(fadeOutInterval);
            // 一言消失完毕后，重新获取并显示新的一言
            getYiYan().then(newYiyan => revealText(yiyanContent, newYiyan, interval));
        }
    }, interval);
}