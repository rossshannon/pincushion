'use strict';

(function() {

var url_params,
    api_endpoint = 'https://pinboard-bridge.herokuapp.com/';

$(function() {
  resize_window();
  parse_url_parameters();
  authenticate_user();
  set_up_fast_click();
  set_up_tag_autocomplete();
  set_up_form_submission();
  check_for_existing_bookmark_details();
  get_suggested_tags();
  download_user_tags();
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
}

function authenticate_user() {
  if (!(url_params['user'] && url_params['token'])) {
    alert('You must provide both ‘user’ and ‘token’ parameters to this page to allow it to use the Pinboard API.');
    $('#submit').addClass('fail');
    $('#submit').prop('disabled', true);
    $('#mainspinner').addClass('hidden');
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
  var bookmark_details_api = api_endpoint + 'posts/get?format=json&auth_token=' + auth_token() +
                             '&url=' + clean_url(url_params['url']);

  $.get(bookmark_details_api, 'json')
    .done(function(response) {
      $('#mainspinner').addClass('hidden');
      $('#submit').data('stateText', 'Add bookmark');
      if (response['posts'].length < 1) { return; }

      var bookmark = response['posts'][0];

      $('input#title').val(bookmark['description']);
      if ((bookmark['extended'] && $('textarea#description').val().length > 0) || bookmark['extended'].length === 0) {
        $('textarea#description').val(bookmark['extended'] + '\n' + $('textarea#description').val());
      } else {
        $('textarea#description').val(bookmark['extended']);
      }
      prepopulate_tags(bookmark['tags']);

      if (bookmark['shared'] === 'no') {
        $('#private').prop('checked', true).change();
      }
      if (bookmark['toread'] === 'yes') {
        $('#toread').prop('checked', true);
      }
      if (bookmark['time']) {
        var date = new Date(bookmark['time']);
        $('#bookmark-status').text('Previously saved on ' +
                                   date.getFullYear() + '/' + date.getMonth() + '/' + date.getDate());
      }
      $('#updating').val('true');
      $('#submit').data('stateText', 'Update bookmark');
      $('#submit span.text').text('Update bookmark');
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
    $('#submit span.text').html('Saving bookmark&hellip;');

    var post_bookmark_api = api_endpoint + 'posts/add?format=json&auth_token=' + auth_token() + '&' +
                            serialized_inputs();

    $.get(post_bookmark_api, 'json')
      .done(function(response) {
        if (response['result_code'] === 'done') {
          console.log('Bookmark saved correctly.');
          Ladda.stopAll();
          $('#submit').addClass('success');
          $('#submit span.text').text('Bookmark saved!');

          save_updated_user_tags();

          setTimeout(function() {
            window.close(); // for windows that are popups
            setTimeout(function() {
              $('#submit').removeClass('success'); // for windows that aren't popups
              $('#submit span.text').text($('#submit').data('stateText')); // revert text
            }, 300);
          }, 900);
        } else if (response['result_code'] === 'must provide title') {
          Ladda.stopAll();
          $('#submit').addClass('fail');
          setTimeout(function() {
            $('#submit').removeClass('fail'); // let user try again
            $('#submit span.text').text($('#submit').data('stateText'));
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

  if ('ontouchstart' in window) {
    $('input#tags')[0].selectize.focus();
  }

  $('#private').on('change', function() {
    reflectPrivateStatus();
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
  }

  $('#suggested button').filter(function() { // don’t suggest tags that the bookmark already has
    return $(this).text().toLowerCase() === tags[i];
  }).hide();
}

function set_up_tag_autocomplete() {
  $('input#tags').selectize({
    delimiter: ' ',
    create: true,
    openOnFocus: false,
    maxOptions: 10,
    persist: true,
    createOnBlur: false,
    hideSelected: true,
    diacritics: true,
    valueField: 'label',
    labelField: 'label',
    searchField: ['label'],
    sortField: [
      {field: '$score', direction: 'desc'},
      {field: 'count', direction: 'desc'},
      {field: 'label', direction: 'asc'},
    ],
    onChange: function(value, $item) {
      $('input#tags')[0].selectize.close();
    },
    render: {
      option: function(data, escape) {
        return '<div class="item">' + escape(data.label) + '<span class="optioncount">' + escape(data.count) + '</span></div>';
      }
    }
  });

  populate_dropdown();
}

function populate_dropdown() {
  if (localStorage && localStorage['tags']) {
    var user_tags = JSON.parse(localStorage['tags']);
    console.log('Populating dropdown.');
    $.each(user_tags, function(key, value) {
      $('input#tags')[0].selectize.addOption({
        label: key,
        count: value
      });
    });
  }
}

function get_suggested_tags() {
  if (!url_params['url']) { return; }
  var suggested_tags_api = api_endpoint + 'posts/suggest?format=json&auth_token=' + auth_token() +
                           '&url=' + clean_url(url_params['url']);

  $('#tagspinner').removeClass('hidden');
  $.get(suggested_tags_api, function(data) {
    show_suggested_tags(data);
    $('#tagspinner').addClass('hidden');
  }, 'json');
}

function show_suggested_tags(tag_suggestions) {
  if (!tag_suggestions) { return; }
  tag_suggestions = $.merge(tag_suggestions[1]['recommended'], tag_suggestions[0]['popular']); // flatten JSON
  tag_suggestions = tag_suggestions.map(function(tag) {
    return tag.toLowerCase(); // lowercase all tags
  });
  tag_suggestions = $.grep(tag_suggestions, function(v, k) {
    return $.inArray(v, tag_suggestions) === k; // filter out duplicates
  });
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
      $(this).hide(150);
      return false;
    });
    $('#suggestion_row th').text('suggested tags');
  } else {
    $('#suggestion_row th').hide(300);
    $('#suggested').addClass('none').text('No suggested tags for this page.');
  }
}

function reflectPrivateStatus() {
  if ($('#private').prop('checked') === true) {
    $('body').addClass('private');
  } else {
    $('body').removeClass('private');
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
            tag !== 'bookmarks_toolbar' && tag !== 'from_pocket' && tag !== 'pocket' && tag !== 'archive' &&
            tag !== 'toread' && tag !== 'readlater');
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
  if (!localStorage) { return; }
  if (!localStorage.tags) {
    console.log('Downloading user’s tags.');
    localStorage['tags'] = JSON.stringify([]);
    var all_tags_api = api_endpoint + 'tags/get?format=json&auth_token=' + auth_token();

    $.get(all_tags_api, 'json')
      .done(function(response) {
        localStorage['tags'] = JSON.stringify(response);
        localStorage['tags-updated'] = new Date();
        console.log('Downloaded tags.');
        populate_dropdown();
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

function clean_url(url) {
  return encodeURIComponent(url);
}

RegExp.escape = function(text) {
  return text.replace(/[-[\]{}()*+?.,\\\\'"^$|#\s]/g, "\\$&"); //"'
}

function close_window(e) {
  if (e.keyCode === 27) {
    window.close();
  }
}

}());
