
var names = ["张海丰", "唐可儿", "陈海玉", "刘文珍", "张敏玲", "卢鹏", "陶子萱", "罗广", "李浩", "盛浩峰", "陈卓", "廖宇阳", "李梓里", "叶金娜", "郑宇胜", "邓凯尹", "林炳锋", "李瑞奇", "郭浩鹏", "李乐瑶", "吴佳欣", "程奕涛", "李佳玲", "黄冠铭", "甘亦超", "王米柔", "刘韬", "何穗希", "陈锡涛", "邓子轩", "叶伟杰", "梁说恩", "林佳琪", "陈俊宇", "钟欣彤", "沈玮宗", "余圳威", "胡静雯", "黄海凝", "杨颖德", "陈嘉豪", "张和", "何冠希", "李子晴", "何冠杰", "龙周天伊", "陈科昕", "林文豪", "马永淳", "王恒书", "陈朗", "杨光", "钟汶芯", "刘俊彦", "杨杰"];
var length = names.length;

var displayBoard = document.getElementById("nameDisplay");

mytime = null

function clickButton(btn) {
    var text = btn.innerHTML;
    console.log(text);

    if (text == "启动!") {
        btn.innerHTML = "抽取幸运儿!";

        if (mytime == null) {
            mytime = setInterval(function () {
                var name = randomName();
                console.log(name);
                displayBoard.innerHTML = name;
            }, 1);
        }

    } else if (text == "抽取幸运儿!") {
        btn.innerHTML = "启动!";

        if (mytime != null) {
            clearInterval(mytime);
            mytime = null;
        }
    }


}

function randomName() {
    var randomNum = Math.ceil(Math.random() * 54) % length + 1;
    return names[randomNum - 1];
}