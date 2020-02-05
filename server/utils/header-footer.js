exports.footer = (text) => `
  <div style="font-size:10px;width:100%;margin-top:10px;margin-left:1.5cm;margin-right:1.5cm;">
    <div style="float:left;">
      <span>${text || ''}</span>
    </div>
    <div style="float:right;">
      <span class="pageNumber"></span>/<span class="totalPages"></span>
    </div>
  </div>
`
