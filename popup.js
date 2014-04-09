var urlParams;

$(function() {
  resizeWindow();
  parseUrlParameters();
  authenticate();
  check_for_existing_bookmark_details();
  setUpFormSubmission();
  get_suggested_tags();
  $('input#tags').focus();
});

/** Ensure window is tall enough to show all form elements. */
function resizeWindow() {
  var min_width = 700;
  var min_height = 600;
  if (window.outerHeight < min_height) {
    window.resizeTo(min_width, min_height);
  }
}

/** Parse URL query parameters into urlParams hash. */
function parseUrlParameters() {
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
  $('#suggestion_row').hide(); // We’ll show it again later if there are any suggestions
}

function authenticate() {
  if (urlParams['user'] && urlParams['token']) {
    $.cookie('pinboard-user', urlParams['user']);
    $.cookie('pinboard-token', urlParams['token']);
  } else {
    alert("You must provide both ‘user’ and ‘token’ parameters to this page to allow it to use the Pinboard API.");
  }
}

function auth_token() {
  return $.cookie('pinboard-user') + ':' + $.cookie('pinboard-token');
}

function serialized_inputs() {
  var serialized_inputs = $('#url, #pin-title, #description, #tags').serialize();
  if ($('#private').prop('checked')) {
    serialized_inputs += '&shared=no';
  }
  if ($('#toread').prop('checked')) {
    serialized_inputs += '&toread=yes';
  }
  return serialized_inputs;
}

/** Check for pre-existing bookmark for this URL. */
function check_for_existing_bookmark_details() {
  var bookmark_details_api = "https://pinboard-bridge.herokuapp.com/posts/get?format=json&auth_token=" + auth_token() + "&url=" + urlParams['url'];

  $.get(bookmark_details_api, function(response) {
    var bookmark = response['posts'][0];

    $('textarea#description').val(bookmark['extended']);
    $('input#tags').val(bookmark['tags']);

    if (bookmark['shared'] == 'no') {
      $('#private').prop('checked', true);
    }
    if (bookmark['toread'] == 'yes') {
      $('#toread').prop('checked', true);
    }
    if (bookmark['time']) {
      var date = new Date(bookmark['time']);
      $('#bookmark-status').text("Previously saved on " + date.getFullYear() + "/" + date.getMonth() + "/" + date.getDate());
    }
    $('#submit').val('Update bookmark');
  }, 'json');
}

/** Submit the form with Ajax */
function setUpFormSubmission() {
  $('#post-to-pinboard').on('submit', function(event) {
    event.preventDefault();

    var post_bookmark_api = "https://pinboard-bridge.herokuapp.com/posts/add?format=json&auth_token=" + auth_token() + "&" + serialized_inputs();

    $.get(post_bookmark_api, function(response) {
      if (response['result_code'] == 'done') {
        console.log("Bookmark saved correctly.");
        $('#submit').addClass('success');
        setTimeout(function() {
          window.close();
        }, 400);
      }
    }, 'json');
  });
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

  var suggested_tags = [];
  for (var i = 0; i < tag_suggestions.length; i++) {
    var suggested_tag = tag_suggestions[i];
    var escaped = pin_escape(suggested_tag);
    var cooked  = pin_cook(suggested_tag);
    var suggested_tag = '<button class="suggested_tag" onclick="add_tag(\''  +
                escaped + '\'); $(this).hide(); return false;">' + cooked + '</button>';
    suggested_tags.push(suggested_tag);
  }

  $('#suggested').append(suggested_tags.join(" "));
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