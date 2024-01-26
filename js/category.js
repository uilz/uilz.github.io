$(document).ready(function() {
	
	categoryUnfold();
	
	function categoryUnfold() {
		$(".category-list-link").filter(function() {
			if($(this).siblings(".category-list-child").length > 0)
				//$(this).parent().css("list-style", "circle");
				$(this).parent().css("list-style-image","url('/assets/img/category-unfold-16x16.png')");
				//console.log($(this).text());
		});
		
		//点击含有子标签category-list-child的category-list-link标签时，不进行跳转
		$(".category-list-link").filter(function() {
			return $(this).siblings(".category-list-child").length > 0
		}).attr("href", "javascript:void(0)");
		
		//含有子标签category-list-child的category-list-link标签将自动隐藏子标签
		$(".category-list-link").filter(function() {
			if($(this).siblings(".category-list-child").length > 0)
				$(this).siblings(".category-list-child").hide();
		});	
		
		//点击含有子标签category-list-child的category-list-link标签时，将隐藏子标签展开
		$(".category-list-link").click(function() {
			$(this).siblings(".category-list-child").slideToggle();
		});
	}
});