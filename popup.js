var urlParams;

$(function() {
  resizeWindow();
  parseUrlParameters();
  authenticate();
  FastClick.attach(document.body);
  setUpFormSubmission();
  setUpTagAutoComplete();
  check_for_existing_bookmark_details();
  get_suggested_tags();
  update_user_tags();
  $('input#tags')[0].selectize.focus();
  Ladda.bind('button[type=submit]');
});

/** Ensure window is tall enough to show all form elements. */
function resizeWindow() {
  var min_width = 600;
  var min_height = 700;
  if (window.outerHeight < min_height) {
    window.resizeTo(min_width, min_height);
  }

  if (document.addEventListener) {
    document.addEventListener('keydown', winclose, false);
  } else {
    document.attachEvent('onkeydown', winclose);
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
  $('input#title').val(urlParams['title']);
  $('textarea#description').val(urlParams['description']);
  $('#suggestion_row, #suggested').hide(); // We’ll show it again later if there are any suggestions
}

function authenticate() {
  if (!(urlParams['user'] && urlParams['token'])) {
    alert("You must provide both ‘user’ and ‘token’ parameters to this page to allow it to use the Pinboard API.");
    $('#submit').addClass('fail');
    $('#submit').prop('disabled', true)
    $('#spinner').addClass('hidden');
  }
}

function auth_token() {
  return urlParams['user'] + ':' + urlParams['token'];
}

function serialized_inputs() {
  var serialized_inputs = $('#url, #title, #description, #tags').serialize();
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
  if (!urlParams['url']) { return; }
  var bookmark_details_api = "https://pinboard-bridge.herokuapp.com/posts/get?format=json&auth_token=" + auth_token() + "&url=" + urlParams['url'];

  $.get(bookmark_details_api, 'json')
    .done(function(response) {
      if (response['posts'].length < 1) { return; }
      var bookmark = response['posts'][0];

      $('input#title').val(bookmark['description']);
      $('textarea#description').val(bookmark['extended']);
      prepopulate_tags(bookmark['tags']);

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
      $('#submit span.text').text('Update bookmark');
      $('#spinner').addClass('hidden');
    })

    .fail(function(response) {
      if (response.status == '401') {
        alert("401 Unauthorised. Please check your username and API access token.");
      }
    });
}

/** Submit the form with Ajax */
function setUpFormSubmission() {
  $('#post-to-pinboard').on('submit', function(event) {
    event.preventDefault();

    var post_bookmark_api = "https://pinboard-bridge.herokuapp.com/posts/add?format=json&auth_token=" + auth_token() + "&" + serialized_inputs();

    $.get(post_bookmark_api, 'json')
      .done(function(response) {
        if (response['result_code'] == 'done') {
          console.log("Bookmark saved correctly.");
          Ladda.stopAll();
          $('#submit').addClass('success');
          setTimeout(function() {
            window.close();
            $('#submit').removeClass('success'); // for windows that aren't popups
          }, 900);
        } else if (response['result_code'] == 'must provide title') {
          Ladda.stopAll();
          $('#submit').addClass('fail');
          setTimeout(function() {
            $('#submit').removeClass('fail'); // let user try again
          }, 1900);
          $('#title').focus();
        }
      })

      .fail(function(response) {
        Ladda.stopAll();
        $('#submit').addClass('fail');
        if (response.status == '401') {
          alert("401 Unauthorised. Please check your username and API access token.");
        }
      });
  });

  $('input, textarea').on('blur', function() {
    $('body').animate({ scrollTop: 0 }, 200);
  });
}

function prepopulate_tags(tagString) {
  var tags = tagString.split(' ');
  for (var i = 0; i < tags.length; i++) {
    $('input#tags')[0].selectize.addOption({
      label: tags[i]
    });
    $('input#tags')[0].selectize.addItem(tags[i]);
    $('input#tags')[0].selectize.close();
  }
}

function setUpTagAutoComplete() {

  $('input#tags').selectize({
    delimiter: ' ',
    create: true,
    openOnFocus: false,
    maxOptions: 6,
    persist: false,
    hideSelected: true,
    diacritics: true,
    valueField: 'label',
    labelField: 'label',
    searchField: ['label'],
    plugins: ['restore_on_backspace'],
  });

  if (localStorage && localStorage['tags']) {
    var user_tags = JSON.parse(localStorage['tags']);
    console.log('Populating dropdown.');
    $.each(user_tags, function(key, value) {
      $('input#tags')[0].selectize.addOption({
        label: key
      });
    });
  }
}

function get_suggested_tags() {
  if (!urlParams['url']) { return; }
  var suggested_tags_api = "https://pinboard-bridge.herokuapp.com/posts/suggest?format=json&url=" + urlParams['url'] + "&auth_token=" + auth_token();

  $('#spinner').removeClass('hidden');
  $.get(suggested_tags_api, function(data) {
    show_suggested_tags(data);
    $('#spinner').addClass('hidden');
  }, 'json');
}

function update_user_tags() {
  if (!localStorage.tags) {
    console.log('Downloading user’s tags.');
    localStorage['tags'] = JSON.stringify([]);
    var all_tags_api = "https://pinboard-bridge.herokuapp.com/tags/get?format=json&auth_token=" + auth_token();

    $.get(all_tags_api, 'json')
      .done(function(response) {
        localStorage['tags'] = JSON.stringify(response);
        localStorage['tags-updated'] = new Date();
      })

      .fail(function(response) {
        if (response.status == '401') {
          alert("401 Unauthorised. Please check your username and API access token.");
        }
      });
  } else {
    console.log('Have tags already.');
  }
}

function show_suggested_tags(tag_suggestions) {
  if (!tag_suggestions) { return; }
  tag_suggestions = $.merge(tag_suggestions[0]['popular'], tag_suggestions[1]['recommended']); // flatten JSON
  tag_suggestions = tag_suggestions.map(function(tag) {
    return tag.toLowerCase(); // lowercase all tags
  });
  tag_suggestions = $.unique(tag_suggestions); // filter out duplicates
  $('#description')
  tag_suggestions = removeSpuriousResults(tag_suggestions); // empty the array if they are the default/broken suggestions
  tag_suggestions = removeOverlyCommonTags(tag_suggestions); // remove tags that appear very often across a wide range of pages

  var suggested_tags = [];
  for (var i = 0; i < tag_suggestions.length; i++) {
    var suggested_tag = tag_suggestions[i];
    var escaped = pin_escape(suggested_tag);
    var cooked  = pin_cook(suggested_tag);
    var suggested_tag = '<button type="button" class="suggested_tag" onclick="add_tag(\''  +
                escaped + '\'); $(this).hide(200); return false;">' + cooked + '</button>';
    suggested_tags.push(suggested_tag);
  }

  if (suggested_tags.length > 0) {
    $('#suggested').append(suggested_tags.join(" "));
    $('#suggestion_row').show();
    $('#suggested').show(800);
  } else {
    $('#suggestion_row th').addClass('none').text('No tag suggestions for this page.');
    $('#suggestion_row').show();
  }
}

/** Remove default set of tags that are suggested by the Pinboard API when there are no good suggestions. */
function removeSpuriousResults(tag_suggestions) {
  if ($.inArray('facebook', tag_suggestions) >= 0 && $.inArray('googlereader', tag_suggestions) >= 0 &&
      $.inArray('ifttt', tag_suggestions) >= 0 && $.inArray('objective-c', tag_suggestions) >= 0 &&
      $.inArray('twitter', tag_suggestions) >= 0 && $.inArray('twitterlink', tag_suggestions) >= 0 &&
      $.inArray('wsh', tag_suggestions) >= 0 && $.inArray('music', tag_suggestions) >= 0 &&
      $.inArray('04:22pm', tag_suggestions) >= 0 && $.inArray('1960s', tag_suggestions) >= 0) {
    return [];
  } else {
    return tag_suggestions;
  }
}

function removeOverlyCommonTags(tag_suggestions) {
  tag_suggestions = $.grep(tag_suggestions, function(tag, index) {
    tag = tag.toLowerCase();
    return (tag != 'bookmarks_bar' && tag != 'pin-later' && tag != 'unread' && tag != '*resources' &&
            tag != 'unlabeled' && tag != 'via:packrati.us' && tag != 'bookmarks_menu' && tag != 'from' &&
            tag != 'ifttt' && tag != 'later' && tag != 'saved' && tag != 'read' && tag != 'feedly' &&
            tag != 'for' && tag != 'recently' && tag != 'tobookmarks' && tag != 'from:ifttt' &&
            tag != 'instapaper' && tag != '!fromtwitter' && tag != 'feedbin' && tag != 'favorites_bar' &&
            tag != 'imported' && tag != '.dailybrowse' && tag != 'barra_dei_preferiti' && tag != 'bookmarks_toolbar' &&
            tag != 'from_pocket');
  });
  return tag_suggestions;
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

RegExp.escape = function(text) {
  return text.replace(/[-[\]{}()*+?.,\\\\'"^$|#\s]/g, "\\$&"); //"'
}

function add_tag(tag) {
  $('input#tags')[0].selectize.addOption({
    label: tag
  });
  $('input#tags')[0].selectize.addItem(tag);
}

function pin_sort(a,b) {
  var l = a.toLowerCase ? a.toLowerCase() : a;
  var r = b.toLowerCase ? b.toLowerCase() : b;
  if (l == r) { return 0; }
  if (l > r) { return 1; }
  return -1;
}

function winclose(e) {
  var code;
  if (e.keyCode) {
    code = e.keyCode;
  } else {
    if (e.which) {
      code = e.which;
    }
  }
  if (code == 27) {
    if (!(pin_tagcomplete && pin_tagcomplete.active())) {
      window.close();
    }
  }
}