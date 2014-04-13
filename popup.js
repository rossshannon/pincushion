'use strict';

var url_params;

$(function() {
  resize_window();
  parse_url_parameters();
  authenticate_user();
  set_up_fast_click();
  set_up_tag_auto_complete();
  check_for_existing_bookmark_details();
  get_suggested_tags();
  set_up_form_submission();
  download_user_tags();
  $('input#tags')[0].selectize.focus();
  Ladda.bind('button[type=submit]');
});

/** Ensure window is tall enough to show all form elements. */
function resize_window() {
  var min_width = 600;
  var min_height = 700;
  if (window.outerHeight < min_height) {
    window.resizeTo(min_width, min_height);
  }
  $(document).keydown(function(e) {
    close_window(e);
  });
}

/** Parse URL query parameters into url_params hash. */
function parse_url_parameters() {
  (window.onpopstate = function () {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')); },
        query  = window.location.search.substring(1);

    url_params = {};
    while (match = search.exec(query)) {
      url_params[decode(match[1])] = decode(match[2]);
    }
  })();

  /* Set form inputs to values passed via URL query parameters. */
  $('input#url').val(url_params['url']);
  $('input#title').val(url_params['title']);
  $('textarea#description').val(url_params['description']);
  $('#suggestion_row, #suggested').hide(); // We’ll show it again later if there are any suggestions
}

function authenticate_user() {
  if (!(url_params['user'] && url_params['token'])) {
    alert('You must provide both ‘user’ and ‘token’ parameters to this page to allow it to use the Pinboard API.');
    $('#submit').addClass('fail');
    $('#submit').prop('disabled', true);
    $('#spinner').addClass('hidden');
  }
}

function auth_token() {
  return url_params['user'] + ':' + url_params['token'];
}

function serialized_inputs() {
  var serialized_form_inputs = $('#url, #title, #description, #tags').serialize();
  if ($('#private').prop('checked')) {
    serialized_form_inputs += '&shared=no';
  }
  if ($('#toread').prop('checked')) {
    serialized_form_inputs += '&toread=yes';
  }
  return serialized_form_inputs;
}

/** Check for pre-existing bookmark for this URL. */
function check_for_existing_bookmark_details() {
  if (!url_params['url']) { return; }
  var bookmark_details_api = 'https://pinboard-bridge.herokuapp.com/posts/get?format=json&auth_token=' + auth_token() + '&url=' + url_params['url'];

  $.get(bookmark_details_api, 'json')
    .done(function(response) {
      if (response['posts'].length < 1) { return; }
      var bookmark = response['posts'][0];

      $('input#title').val(bookmark['description']);
      $('textarea#description').val(bookmark['extended'] + '\n\n' + $('textarea#description').val());
      prepopulate_tags(bookmark['tags']);

      if (bookmark['shared'] === 'no') {
        $('#private').prop('checked', true);
      }
      if (bookmark['toread'] === 'yes') {
        $('#toread').prop('checked', true);
      }
      if (bookmark['time']) {
        var date = new Date(bookmark['time']);
        $('#bookmark-status').text('Previously saved on ' + date.getFullYear() + '/' + date.getMonth() + '/' + date.getDate());
      }
      $('#updating').val('true');
      $('#submit span.text').text('Update bookmark');
      $('#spinner').addClass('hidden');
    })

    .fail(function(response) {
      if (response.status === '401') {
        alert('401 Unauthorised. Please check your username and API access token.');
      }
    });
}

/** Submit the form with Ajax */
function set_up_form_submission() {
  $('#post-to-pinboard').on('submit', function(event) {
    event.preventDefault();

    var post_bookmark_api = 'https://pinboard-bridge.herokuapp.com/posts/add?format=json&auth_token=' + auth_token() + '&' + serialized_inputs();

    $.get(post_bookmark_api, 'json')
      .done(function(response) {
        if (response['result_code'] === 'done') {
          console.log('Bookmark saved correctly.');
          Ladda.stopAll();
          $('#submit').addClass('success');

          save_updated_user_tags();

          setTimeout(function() {
            $('#submit').removeClass('success'); // for windows that aren't popups
            window.close(); // for windows that are popups
          }, 900);
        } else if (response['result_code'] === 'must provide title') {
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
        if (response.status === '401') {
          alert('401 Unauthorised. Please check your username and API access token.');
        }
      });
  });

  $('input, textarea').on('blur', function() {
    $('body').animate({ scrollTop: 0 }, 200);
  });
}

function set_up_fast_click() {
  var SelectiveFastClick = require('selective-fastclick');
  var selectors = [
    'input[type=text], input[type=url], textarea',
    'button.suggested_tag',
    'label'
  ];
  SelectiveFastClick.attach(document.body, selectors);
}

function prepopulate_tags(tag_string) {
  $('input#tags').data('previous_tags', tag_string);

  var tags = tag_string.split(' ');
  for (var i = 0; i < tags.length; i++) {
    $('input#tags')[0].selectize.addOption({
      label: tags[i]
    });
    $('input#tags')[0].selectize.addItem(tags[i]);
    $('input#tags')[0].selectize.close(); // stop it from opening after these programmatic additions

    $('#suggested button').filter(function() { // don’t suggest tags that the bookmark already has
      return $(this).text().toLowerCase() === tags[i];
    }).hide();
  }
}

function set_up_tag_auto_complete() {
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
    $.each(user_tags, function(key) {
      $('input#tags')[0].selectize.addOption({
        label: key
      });
    });
  }
}

function get_suggested_tags() {
  if (!url_params['url']) { return; }
  var suggested_tags_api = 'https://pinboard-bridge.herokuapp.com/posts/suggest?format=json&url=' + url_params['url'] + '&auth_token=' + auth_token();

  $('#spinner').removeClass('hidden');
  $.get(suggested_tags_api, function(data) {
    show_suggested_tags(data);
    $('#spinner').addClass('hidden');
  }, 'json');
}

function show_suggested_tags(tag_suggestions) {
  if (!tag_suggestions) { return; }
  tag_suggestions = $.merge(tag_suggestions[0]['popular'], tag_suggestions[1]['recommended']); // flatten JSON
  tag_suggestions = tag_suggestions.map(function(tag) {
    return tag.toLowerCase(); // lowercase all tags
  });
  tag_suggestions = $.unique(tag_suggestions); // filter out duplicates
  tag_suggestions = remove_spurious_results(tag_suggestions); // empty the array if they are the default/broken suggestions
  tag_suggestions = remove_overly_common_tags(tag_suggestions); // remove tags that appear very often across a wide range of pages

  var suggested_tags = [];
  for (var i = 0; i < tag_suggestions.length; i++) {
    /* Don’t show a suggested tag if it is already present in the tag field. */
    if ((' ' + $('#tags').val() + ' ').indexOf(' ' + tag_suggestions[i] + ' ') === -1) {
      var suggested_tag = '<button type="button" class="suggested_tag">' + pin_cook(tag_suggestions[i]) + '</button>';
      suggested_tags.push(suggested_tag);
    }
  }

  if (suggested_tags.length > 0) {
    $('#suggested').append(suggested_tags.join(' '));
    $('#suggested button').on('click', function() {
      add_tag(pin_escape($(this).text()));
      $(this).hide(200);
      return false;
    });
    $('#suggestion_row').show();
    $('#suggested').show(800);
  } else {
    $('#suggestion_row th').addClass('none').text('No tag suggestions for this page.');
    $('#suggestion_row').show();
  }
}

/** Remove default set of tags that are suggested by the Pinboard API when there are no good suggestions. */
function remove_spurious_results(tag_suggestions) {
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

function remove_overly_common_tags(tag_suggestions) {
  tag_suggestions = $.grep(tag_suggestions, function(tag) {
    tag = tag.toLowerCase();
    return (tag !== 'bookmarks_bar' && tag !== 'pin-later' && tag !== 'unread' && tag !== '*resources' &&
            tag !== 'unlabeled' && tag !== 'via:packrati.us' && tag !== 'bookmarks_menu' && tag !== 'from' &&
            tag !== 'ifttt' && tag !== 'later' && tag !== 'saved' && tag !== 'read' && tag !== 'feedly' &&
            tag !== 'for' && tag !== 'recently' && tag !== 'tobookmarks' && tag !== 'from:ifttt' &&
            tag !== 'instapaper' && tag !== '!fromtwitter' && tag !== 'feedbin' && tag !== 'favorites_bar' &&
            tag !== 'imported' && tag !== '.dailybrowse' && tag !== 'barra_dei_preferiti' &&
            tag !== 'bookmarks_toolbar' && tag !== 'from_pocket');
  });
  return tag_suggestions;
}

function add_tag(tag) {
  $('input#tags')[0].selectize.addOption({
    label: tag
  });
  $('input#tags')[0].selectize.addItem(tag);
}

function download_user_tags() {
  if (!(localStorage && localStorage.tags)) {
    console.log('Downloading user’s tags.');
    localStorage['tags'] = JSON.stringify([]);
    var all_tags_api = 'https://pinboard-bridge.herokuapp.com/tags/get?format=json&auth_token=' + auth_token();

    $.get(all_tags_api, 'json')
      .done(function(response) {
        localStorage['tags'] = JSON.stringify(response);
        localStorage['tags-updated'] = new Date();
      })

      .fail(function(response) {
        if (response.status === '401') {
          alert('401 Unauthorised. Please check your username and API access token.');
        }
      });
  } else {
    console.log('Have tags already.');
  }
}

function save_updated_user_tags() {
  var user_tags = JSON.parse(localStorage['tags']);
  var potentially_new_tags = $('input#tags').val().split(' ');

  for (var i = 0; i < potentially_new_tags.length; i++) {
    if (user_tags[potentially_new_tags[i]]) {
      if ($('input#tags').data('previous_tags') &&
          $('input#tags').data('previous_tags').indexOf(potentially_new_tags[i]) !== -1) {
        continue; // this tag was already present when the bookmark was saved previously
      } else {
        user_tags[potentially_new_tags[i]] = parseInt(user_tags[potentially_new_tags[i]]) + 1; // new tag, increment count
      }
    } else {
      user_tags[potentially_new_tags[i]] = 1; // completely new tag, instantiate it in local tag set
    }
  }
  localStorage['tags'] = JSON.stringify(user_tags);
  localStorage['tags-updated'] = new Date();
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

function close_window(e) {
  if (e.keyCode === 27) {
    window.close();
  }
}