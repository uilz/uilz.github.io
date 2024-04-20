var names = ["刘健翔", "庞金帅", "林晓洁", "梁雅诗", "谢斌锋", "张琳欣", "杨博", "谢晓", "杨哲聪", "徐麒", "彭威", "周丹阳", "梁志武", "谢嘉兴", "曾令轩", "曾嘉瑜", "吴海汪", "施展谋", "陈焕", "向美芯", "汤蕾", "郑希怡", "乔梓健", "钟博文", "文小杰", "谭智豪", "张子欣", "胡俊权", "朱奕濠", "林淑雯", "龚小于", "李键朗", "谭丽萱", "郭广圣", "尹晓敏", "叶俊熙", "骆俐桥", "何梓轩", "胡浩群", "唐贵旭", "余俊豪", "陈贝琳", "陈烁锋", "王旭斌", "周彦文", "陈栎轩", "吴桐雨", "吴一卓", "游宁都", "廖涛", "陈颢中", "陈浩斌", "李光栩", "彭根裕", "谢宇", "廖涛", "廖涛", "游宁都", "李光栩"];
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
            }, 18);
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
    var randomNum = Math.ceil(Math.random() * 100) % length + 1;
    return names[randomNum - 1];
}