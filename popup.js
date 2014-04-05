$(function() {
  /* Ensure window is tall enough to show all form elements. */
  var min_height = 550;
  if (window.outerHeight < min_height) {
    window.resizeTo(700, min_height);
  }

  /* Parse URL query parameters into urlParams hash. */
  var urlParams;
  (window.onpopstate = function () {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        query  = window.location.search.substring(1);

    urlParams = {};
    while (match = search.exec(query))
       urlParams[decode(match[1])] = decode(match[2]);
  })();
  /* Set form inputs to values passed via URL query parameters. */
  $('input#url').val(urlParams['url']);
  $('input#pin-title').val(urlParams['title']);
  $('textarea#description').val(urlParams['description']);

  get_suggested_tags();
  $('input#tags').focus();
});

function pin_escape(s) {
  s = s.replace(/\\/g, "\\\\");
  s = s.replace(/'/g, "\\'"); // "
  s = s.replace(/"/g, '&quot;'); // "
  return s;
}

function pin_cook(s) {
  s = s.replace(/</g, '&lt;');
  s = s.replace(/>/g, '&gt;');
  s = s.replace(/"/g, '&quot;');  //"
  return s;
}

function pin_sort(a,b) {
  var l = a.toLowerCase ? a.toLowerCase() : a;
  var r = b.toLowerCase ? b.toLowerCase() : b;
  if (l == r) { return 0; }
  if (l > r) { return 1; }
  return -1;
}