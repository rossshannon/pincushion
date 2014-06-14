'use strict';

(function() {

var url_params,
    API_ENDPOINT = 'https://pinboard-bridge.herokuapp.com/',
    SUBMISSION_BLOCK_DELAY = 100,
    submission_block_timer = false,
    submit_error_timer,
    field_error_timer;

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
});

/** Ensure window is tall enough to show all form elements. */
function resize_window() {
  var min_width = 600;
  var min_height = 750;
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
  $('input#title').val(clean_title(url_params['title']));
}

function authenticate_user() {
  if (!(url_params['user'] && url_params['token'])) {
    display_critical_error('You must provide both ‘user’ and ‘token’ parameters to this page to allow it to use the Pinboard API.')
  }
}

function display_critical_error(message) {
  alert(message);
  $('.helptext').remove();
  $('#submit').addClass('fail');
  $('#submit').prop('disabled', true);
  $('#mainspinner').addClass('hidden');
}

function auth_token() {
  return url_params['user'] + ':' + url_params['token'];
}

function serialized_inputs() {
  $('#description').val($.trim($('#description').val()));
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
  var bookmark_details_api = API_ENDPOINT + 'posts/get?format=json&auth_token=' + auth_token() +
                             '&url=' + clean_url(url_params['url']);

  $.support.cors = true;
  $.get(bookmark_details_api)
    .done(function(response) {
      $('#mainspinner').addClass('hidden');
      $('#submit').data('stateText', 'Add bookmark');
      if (response['posts'].length !== 1) { return; }

      var bookmark = response['posts'][0];

      $('input#title').val(bookmark['description']);

      if (bookmark['extended']) { // previously-saved bookmark description
        console.log('here');
        console.log($.trim(bookmark['extended']));
        console.log($.trim(url_params['description']));
        if ($.trim(bookmark['extended']) !== $.trim(url_params['description'])) { // ignore duplication
          console.log('NOT identical');
          $('textarea#description').val($.trim(bookmark['extended']) + '\n\n' + $.trim(url_params['description']));
        }
      } else {
        $('textarea#description').val($.trim(url_params['description'])); // just trim selected text
      }
      leaveAGap();

      prepopulate_tags(bookmark['tags']);

      if (bookmark['shared'] === 'no') {
        $('#private').prop('checked', true).change();
      }
      if (bookmark['toread'] === 'yes') {
        $('#toread').prop('checked', true);
      }
      if (bookmark['time']) {
        var date = new Date(bookmark['time']);
        $('#bookmark-status')
          .attr('title', moment(date).format("dddd, MMMM Do YYYY, h:mma"))
          .text('Originally saved ' + moment(date).fromNow());
      }

      $('#submit').data('stateText', 'Update bookmark');
      $('#submit span.text').text('Update bookmark');
    })

    .fail(function(response) {
      if (response.status === 0 && (response.statusText === 'No Transport' || 'Error: Access is denied.')) {
        display_critical_error('Cross-domain request failed. Your browser is denying this request from being sent.');
      }
      if (response.status === 401) {
        display_critical_error('401 Unauthorised. Please check the username and API access token you provided.');
      }
    });
}

/** Submit the form with Ajax */
function set_up_form_submission() {
  $('#post-to-pinboard').on('submit', function(event) {
    event.preventDefault();
    $('#submit span.text').html('Saving bookmark&hellip;');

    var post_bookmark_api = API_ENDPOINT + 'posts/add?format=json&auth_token=' + auth_token() +
                            '&' + serialized_inputs();

    $.get(post_bookmark_api)
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
        } else { // API errors
          Ladda.stopAll();
          $('.helptext').remove();
          $('#submit').addClass('fail');

          if (response['result_code'] === 'missing url') {
            $('label[for=url]').addClass('error').append('<span class="helptext"> is required</span>');
            $('#url').focus();
          }
          if (response['result_code'] === 'must provide title') {
            $('label[for=title]').addClass('error').append('<span class="helptext"> is required</span>');
            $('#title').focus();
          }

          $('.helptext').fadeIn();
          removeErrorStateAfterDelay();
        }
      })

      .fail(function(response) { // HTTP errors
        Ladda.stopAll();
        $('.helptext').remove();
        $('#submit').addClass('fail');

        if (response.status === 0 && response.statusText === 'error') {
          alert('Cross-domain request failed. The request may be too long; please try shortening the description text.');
        }
        if (response.status === 414) {
          $('label[for=description]').addClass('error').append('<span class="helptext"> is too long</span>');
          $('#description').focus();
        }
        if (response.status === 401) {
          display_critical_error('401 Unauthorised. Please check the username and API access token you provided.');
        }

        $('.helptext').fadeIn();
        removeErrorStateAfterDelay();
      });
  });

  $('input, textarea').on('blur', function() {
    $('body').animate({ scrollTop: 0 }, 200);
  });

  if (!('ontouchstart' in window)) {
    $('input#tags')[0].selectize.focus(); // focus tags field for non-touch-based browsers
  }

  $('textarea#description').on('blur', function() {
    leaveAGap();
  });

  $('#private').on('change', function() {
    reflectPrivateStatus();
  });

  Ladda.bind('button[type=submit]');
}

function leaveAGap() {
  $('textarea#description').val($.trim($('textarea#description').val()));
  if ($('textarea#description').val() !== '') {
    $('textarea#description').val($('textarea#description').val() + '\n\n');
    $('textarea#description').animate({scrollTop: '800'}, 1000); // scroll to bottom
  }
}

function removeErrorStateAfterDelay() {
  clearTimeout(submit_error_timer);
  clearTimeout(field_error_timer);

  submit_error_timer = setTimeout(function() {
    $('#submit').removeClass('fail');
    $('#submit span.text').text($('#submit').data('stateText'));
  }, 1500);
  field_error_timer = setTimeout(function() {
    $('label span.helptext').fadeOut(300, function() {
      $(this).remove();
      $('label').removeClass('error');
    });
  }, 2900);
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
  }).remove();
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
    selectOnTab: false,
    diacritics: true,
    valueField: 'label',
    labelField: 'label',
    searchField: ['label'],
    sortField: [
      {field: '$score', direction: 'desc'},
      {field: 'count', direction: 'desc'},
      {field: 'label', direction: 'asc'},
    ],
    plugins: {
      'remove_button': {
        title: 'Remove this tag'
      }
    },
    onEnterKeypress: function(el) {
      if (submission_block_timer === false) { // only if user is not entering tags
        $('#submit').click();
      }
    },
    onChange: function(value) {
      $('input#tags')[0].selectize.close();

      submission_block_timer = true
      setTimeout(function() {
        submission_block_timer = false; // allow submission
      }, SUBMISSION_BLOCK_DELAY);
    },
    onItemAdd: function(value, $item) {
      $('.suggested_tag').each(function() {
        if ($(this).text() === value) {
          $(this).hide(400, function() {
            $(this).remove();
            removeSuggestedTagSeparator();
          });
        }
      });
      $('input#tags')[0].selectize.close();
    },
    render: {
      option: function(data, escape) {
        return '<div class="item">' + escape(data.label) +
               '<span class="optioncount ' + tagweight(escape(data.count)) + '">' +
               (data.count !== undefined ? escape(data.count) : '0') + '</span></div>';
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
  var suggested_tags_api = API_ENDPOINT + 'posts/suggest?format=json&auth_token=' + auth_token() +
                           '&url=' + clean_url(url_params['url']);

  $('#tagspinner').removeClass('hidden');
  $.get(suggested_tags_api)
    .done(function(response) {
      show_suggested_tags(response);
      $('#tagspinner').addClass('hidden');
    })

    .fail(function(response) {
      $('#suggestion_row th').hide(800);
      $('#tagspinner').hide(300);
    });
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
  tag_suggestions = rank_users_tags_higher(tag_suggestions); // make tags that a user has used before appear early in the list

  var suggested_tags = [];
  for (var i = 0; i < tag_suggestions.length; i++) {
    /* Draw separator between user's previously-used tags and others, if present */
    if (tag_suggestions[i] === '$separator') {
      suggested_tags.push('<hr>');
      continue;
    }
    /* Don’t show a suggested tag if it is already present in the tag field. */
    if ((' ' + $('#tags').val() + ' ').indexOf(' ' + tag_suggestions[i] + ' ') === -1) {
      suggested_tags.push('<button type="button" class="suggested_tag">' + pin_cook(tag_suggestions[i]) + '</button>');
    }
  }

  if (suggested_tags.length > 0) {
    $('#suggested').append(suggested_tags.join(''));
    $('#suggested button').on('click', function(event) {
      event.preventDefault();
      add_tag(pin_escape($(this).text()));

      $(this).hide(100, function() {
        $(this).remove();
        removeSuggestedTagSeparator();
      });
    });
    removeSuggestedTagSeparator();
    $('#suggestion_row th').text('suggested tags');
  } else {
    $('#suggestion_row th').hide(300);
    $('#suggested').addClass('none').text('No suggested tags for this page.');
  }
}

/* Remove <hr> separator  if there are no tags on either side */
function removeSuggestedTagSeparator() {
  if ($('#suggested').children().length > 0 &&
      ($('#suggested').children(':visible').first()[0].tagName === 'HR' ||
       $('#suggested').children(':visible').last()[0].tagName === 'HR')) {
    $('#suggested hr').hide(200, function() {
      $(this).remove();
    });
  }
  if ($('#suggested button').length === 0) {
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

function clean_title(title_string) {
  return (title_string ? title_string.replace(/^▶ /, '') : '');
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
  var ignored_tags = [
    'bookmarks_bar', 'pin-later', 'unread', '*resources', 'unlabeled', 'via:packrati.us', 'bookmarks_menu', 'from', 'ifttt', 'later', 'saved', 'read', 'feedly', 'for', 'recently', 'tobookmarks', 'from:ifttt', 'instapaper', '!fromtwitter', 'feedbin', 'favorites_bar', 'imported', '.dailybrowse', 'barra_dei_preferiti', 'bookmarks_toolbar', 'via:pocket', 'from_pocket', 'pocket', 'archive', 'toread', 'readlater', 'via:popular', '!tweet', 'twitter-fav', 'created-by:ifttt', 'starred', 'soon', 'riposte', 'github:starred', 'iftttfeedly', 'github-starred-to-pinboard', 'appdotnet', 'top', 'instapaper:'
  ];
  tag_suggestions = $.grep(tag_suggestions, function(tag) {
    return $.inArray(tag.toLowerCase(), ignored_tags) === -1;
  });
  tag_suggestions = $.grep(tag_suggestions, function(tag) {
    return tag.toLowerCase().match(/^via:/) === null; // filter out all 'via:' tags
  });
  return tag_suggestions;
}

function rank_users_tags_higher(tag_suggestions) {
  if (!(localStorage && localStorage['tags'])) { return; }

  var ranked_tags = [];
  var user_tags = JSON.parse(localStorage['tags']);
  var separator = true;

  $.each(tag_suggestions, function(index, tag) {
    if (user_tags.hasOwnProperty(tag)) { // user has used this tag before
      if (separator) {
        ranked_tags.unshift('$separator');
        separator = false;
      }
      ranked_tags.unshift(tag); // prepend to array
    } else {
      ranked_tags.push(tag); // append to array
    }
  });
  return ranked_tags;
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
    var all_tags_api = API_ENDPOINT + 'tags/get?format=json&auth_token=' + auth_token();

    $.get(all_tags_api)
      .done(function(response) {
        localStorage['tags'] = JSON.stringify(response);
        localStorage['tags-updated'] = new Date();
        console.log('Downloaded tags.');
        populate_dropdown();
      })

      .fail(function(response) {
        if (response.status === 401) {
          display_critical_error('401 Unauthorised. Please check the username and API access token you provided.');
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

function tagweight(count) {
  switch (true) {
    case (count > 100): return 'tw100'; break;
    case (count > 50): return 'tw50'; break;
    case (count > 10): return 'tw10'; break;
    case (count > 1): return 'tw1'; break;
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
