exports.footer = () => `
<style>
.footer {
  position: absolute;
  width: 100%;
  background-color: blue;
  font-size: 12px;
  color: black;
  margin: 6px;
  z-index:1000;
}
.footer .right {
  float: right;
}
</style>

<div class="footer">
  <div class="left">
    <span>TEST</span>
  </div>
  <div class="right">
    <span class="pageNumber"></span>/<span class="totalPages"></span>
  </div>
</div>
`
