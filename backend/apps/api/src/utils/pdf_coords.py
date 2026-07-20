"""PDF 坐标约定说明。

全链路统一使用左上原点、y 向下(pt)：
- pdf.js 渲染坐标
- PyMuPDF(fitz) widget.rect / 绘制坐标
- template_field.pos_x / pos_y / width / height 存储

前端缩放仅影响展示，保存时需除以 currentZoomScale 还原为 100% pt 值。
"""
