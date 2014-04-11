var urlParams;

$(function() {
  resizeWindow();
  parseUrlParameters();
  authenticate();
  check_for_existing_bookmark_details();
  FastClick.attach(document.body);
  setUpFormSubmission();
  setUpTagAutoComplete();
  get_suggested_tags();
  update_user_tags();
  $('input#tags').focus();
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
}

function setUpTagAutoComplete() {
  console.log('Setting up autocomplete.');

  var jsonString = '[{"label":"System Administrator","value":"1"},{"label":"Software Tester","value":"3"},{"label":" Software Developer","value":"4"},{"label":"Senior Developer","value":"5"},{"label":"Cloud Developer","value":"6"},{"label":"Wordpress Designer","value":"7"}]';

  var jsonObj = $.parseJSON(jsonString);
  var sourceArr = [];
  for (var i = 0; i < jsonObj.length; i++) {
    sourceArr.push(jsonObj[i].label);
  }

  console.log(sourceArr);

  $('#tags').typeahead({
    minLength: 2,
    highlight: true,
    hint: true,
    source: sourceArr
  });
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
    localStorage['tags'] = JSON.stringify([]);
    var all_tags_api = "https://pinboard-bridge.herokuapp.com/tags/get?format=json&auth_token=" + auth_token();

    $.get(all_tags_api, 'json')
      .done(function(response) {
        console.log(response);
        localStorage['tags'] = JSON.stringify(response);
        localStorage['tags-updated'] = new Date();
      })

      .fail(function(response) {
        if (response.status == '401') {
          alert("401 Unauthorised. Please check your username and API access token.");
        }
      });
  } else {
    console.log('Have tags');
    console.log(JSON.parse(localStorage['tags']));
  }
}

function prepareDatabase(ready, error) {
  return openDatabase('tags', '1.0', 'Local tag lookup cache', (50 * 1024 * 1024), function(db) {
      db.changeVersion('', '1.0', function (t) {
          t.executeSql('CREATE TABLE tagids (id, name)');
      }, error);
  });
}

function show_suggested_tags(tag_suggestions) {
  if (!tag_suggestions) { return; }
  tag_suggestions = tag_suggestions[0]['popular'].concat(tag_suggestions[1]['recommended']); // flatten JSON
  tag_suggestions = $.unique(tag_suggestions); // filter out duplicates
  tag_suggestions = removeSpuriousResults(tag_suggestions); // empty the array if they are the default/broken suggestions

  var suggested_tags = [];
  for (var i = 0; i < tag_suggestions.length; i++) {
    var suggested_tag = tag_suggestions[i];
    var escaped = pin_escape(suggested_tag);
    var cooked  = pin_cook(suggested_tag);
    var suggested_tag = '<button type="button" class="suggested_tag" onclick="add_tag(\''  +
                escaped + '\'); $(this).hide(); return false;">' + cooked + '</button>';
    suggested_tags.push(suggested_tag);
  }

  if (suggested_tags.length) {
    $('#suggested').append(suggested_tags.join(" "));
    $('#suggested').show(800);
  } else {
    $('#suggestion_row th').text('No tag suggestions for this page.');
    $('#suggestion_row').show();
  }
}

/** Remove default set of tags that are suggested by the Pinboard API when there are no good suggestions. */
function removeSpuriousResults(tag_suggestions) {
  if ($.inArray('facebook') && $.inArray('googlereader') && $.inArray('ifttt') && $.inArray('objective-c') &&
      $.inArray('twitter') && $.inArray('twitterlink') && $.inArray('WSH') && $.inArray('music') &&
      $.inArray('04:22PM') && $.inArray('1960s')) {
    return [];
  } else {
    return tag_suggestions;
  }
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
  var field = $('#tags');
  var curr = field.val();
  var tag_regex = new RegExp( "(\\b|\\s)" + RegExp.escape(tag) + "(\\b|\\s)");
  if (curr.match(tag_regex) === null) {
    // TODO handle case when tag is at start of field
    field.val(field.val() + " " + tag);
  }
  return false;
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