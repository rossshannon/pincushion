  var urlParams;

  $(function() {
  /* Ensure window is tall enough to show all form elements. */
  var min_height = 600;
  if (window.outerHeight < min_height) {
    window.resizeTo(700, min_height);
  }

  /* Parse URL query parameters into urlParams hash. */
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
  $('#suggestion_row').hide(); // We’ll show it again if there are any suggestions

  authenticate(urlParams);

  get_suggested_tags();
  $('input#tags').focus();
});

function GET(url, callback) {
  run_request('GET', url, null, callback);
}

function authenticate(urlParams) {
  if (urlParams['user'] && urlParams['token']) {
    $.cookie('pinboard-user', urlParams['user']);
    $.cookie('pinboard-token', urlParams['token']);
  } else {
    alert("You must provide both ‘user’ and ‘token’ parameters to this page to use the Pinboard API.");
  }
}

function auth_token() {
  return $.cookie('pinboard-user') + ':' + $.cookie('pinboard-token');
}

function get_suggested_tags() {
  var suggested_tags_api = "https://pinboard-bridge.herokuapp.com/posts/suggest?format=json&url=" + urlParams['url'] + "&auth_token=" + auth_token();

  $.get(suggested_tags_api, function(data) {
    show_suggested_tags(data);
  }, 'json');
}

function show_suggested_tags(tag_suggestions) {
  if (!tag_suggestions) { return; }
  tag_suggestions = tag_suggestions[0]['popular'].concat(tag_suggestions[1]['recommended']); // flatten JSON
  tag_suggestions = $.unique(tag_suggestions); // filter out duplicates
  var links = [];
  for (var i = 0; i < tag_suggestions.length; i++) {
    var tag = tag_suggestions[i];
    var escaped = pin_escape(tag);
    var cooked  = pin_cook(tag);
    var link = '<a href="#" class="suggested_tag" onclick="add_tag(\''  +
                escaped + '\'); return false;">' + cooked + '</a>&nbsp;';
    links.push(link);
  }

  $('#suggested').append(links.join(" "));
  $('#suggestion_row').show();
}

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