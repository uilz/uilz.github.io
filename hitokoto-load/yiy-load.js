var txtUrl = "/hitokoto-load/quotes.txt"; // 一言文本文件位置

window.onload = function () {
    // 加载动画
    setTimeout(function () {
        var txloader = document.getElementsByClassName("txloader")[0];
        txloader.className = "txloader fadeout";
        setTimeout(function () { txloader.style.display = "none" }, 300)
    }, 300)
    // 一言
    getQuotesTxt('quotes', txtUrl); // 获取一言
    window.setInterval(() => { getQuotesTxt('quotes', txtUrl); }, 98500); // 加个定时器自动刷新
}

function getQuotesTxt(id, url) {
    if (!url) {
        return "TXT 文件路径未设置！";
    }

    fetch(url)
        .then(function (response) {
            if (!response.ok) {
                throw new Error("网络响应不正确");
            }
            return response.text();
        })
        .then(function (text) {
            var resultArr = text.split('\n');
            var i = Math.floor(Math.random() * resultArr.length);
            var resultTxt = resultArr[i];
            document.getElementById(id).innerHTML = resultTxt;
        })
        .catch(function (error) {
            console.error('获取一言时发生错误：', error);
        });
}