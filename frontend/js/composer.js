/* Codex 式输入卡片：宽度由外层固定，文本区只随内容在 1–6 行之间长高。
   输入区与底部工具条分开排，模型选择和发送键固定在右下角。 */
(function () {
  var wrap = document.querySelector('.composer');
  if (!wrap) return;
  var field = wrap.querySelector('.composer__input');
  if (!field) return;

  var MIN_H = 54;
  var MAX_H = 150;

  function layout() {
    /* 高度先放回 auto 量内容高度，再夹在 1–6 行之间；
       量出来超过六行就把纵向滚动放开，光标在末行时浏览器自己会跟 */
    field.style.height = 'auto';
    var content = field.scrollHeight;
    field.style.height = Math.min(Math.max(content, MIN_H), MAX_H) + 'px';
    field.style.overflowY = content > MAX_H + 1 ? 'auto' : 'hidden';
  }

  /* 点这一格以外的任何地方，都把这枚输入框的选中态收掉。
     不能指望浏览器自己收：模型画布那边在 pointerdown 上 preventDefault
     （要拖关节、也不希望一拖就选中页面文字），而默认行为一旦被拦，
     焦点就不会从 textarea 转走，那道主题色内描边会一直挂着，
     看上去像还在等着输入。所以自己在捕获阶段先收 —— 早于画布那层的
     pointerdown，也早于按钮自己的按下动画。
     落点仍在输入框或发送钮上就放过：那两处是「还在这格上操作」，
     选中态该留着，发完一条接着打下一条也不用再点一次框。
     其它会把焦点带走的元素（胶囊、栏体、弹窗）本来就由浏览器接管，
     这里补的那次 blur 只是把顺序提到前面，不会有第二遍 */
  document.addEventListener('pointerdown', function (event) {
    if (document.activeElement !== field) return;
    var target = event.target;
    if (target && target.closest && target.closest('.composer')) return;
    field.blur();
  }, true);

  field.addEventListener('input', layout);
  window.addEventListener('resize', layout);
  layout();
})();
