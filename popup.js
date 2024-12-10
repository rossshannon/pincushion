import * as Ladda from 'ladda';
import OpenAI from 'openai';

(function() {
  const originalSearch = window.location.search;
  let url_params;

  if (originalSearch) {
    try {
      const params = new URLSearchParams(originalSearch);
      url_params = {};
      for (const [key, value] of params.entries()) {
        url_params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
      }
    } catch (e) {
      console.error('Error parsing initial parameters:', e);
    }
  }

  let submission_block_timer = false,
    submit_error_timer,
    field_error_timer;

  let bookmark,
    existingTags;

  const SUBMISSION_BLOCK_DELAY = 10,
    API_ENDPOINT = 'https://pinboard-api.herokuapp.com/',
    TAG_DOWNLOAD_DELAY = 10000, // 10 seconds
    SUBMISSION_REQUEST_TIMEOUT = 25000, // 25 seconds
    GPT_TEMPERATURE = 0.4;

  $(function() {
    if (!url_params || Object.keys(url_params).length === 0) {
      parse_url_parameters();
    }

    set_form_inputs();
    resize_window();
    authenticate_user();
    set_up_tag_autocomplete();
    set_up_form_submission();
    check_for_existing_bookmark_details();
    get_suggested_tags();
    prepare_user_tags();
  });

  /** Parse URL query parameters into url_params hash. */
  function parse_url_parameters() {
    console.log('Parsing URL parameters');
    const searchParams = new URLSearchParams(window.location.search);
    url_params = url_params || {};

    for (const [key, value] of searchParams.entries()) {
      url_params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }

  /** Set form input values from url_params */
  function set_form_inputs() {
    $('input#url').val(url_params['url']);
    $('input#title').val(clean_title(url_params['title']));
    $('textarea#description').val($.trim(url_params['description']));
    $('input#private').prop('checked', url_params['private'] === 'true');
    $('input#toread').prop('checked', url_params['private'] === 'true');
    leave_a_gap();

    // detect if a hash character is present in the URL, and if so, set a class on the URL input field
    if (url_params['url'] && url_params['url'].indexOf('#') !== -1) {
      $('input#url').addClass('hash-detected');
      // add button beside URL input field to remove hash
      setTimeout(function () {
        $('input#url').after(
          '<button id="remove-hash" class="fa fa-hashtag" title="Remove hash from URL"></button>'
        );

        $('#remove-hash').click(function (event) {
          event.preventDefault();
          $('input#url').val($('input#url').val().replace(/#.*$/, ''));
          $(this).slideUp(200);
          setTimeout(function () {
            $('input#url').removeClass('hash-detected');
          }, 200);
        });
      }, 300);
    }
  }

  function authenticate_user() {
    if (!(url_params['user'] && url_params['token'])) {
      display_critical_error(
        "You must provide both ‘user’ and ‘token’ parameters to this page to allow it to use the Pinboard API."
      );
    }
  }

  /** Check for pre-existing bookmark for this URL. */
  function check_for_existing_bookmark_details() {
    if (!url_params['url']) {
      return;
    }
    var bookmark_details_api =
      API_ENDPOINT + 'posts/get?format=json&auth_token=' + auth_token() + '&url=' + clean_url(url_params['url']);

    $.support.cors = true;
    $.ajax({
      url: bookmark_details_api,
      type: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
    .done(function(response) {
      $('#mainspinner').addClass('hidden');
      $('#submit').data('stateText', 'Add bookmark');

      if (response['posts'].length !== 1) {
        queryGPTForTags()
          .then(console.log)
          .catch(console.error);
        return;
      } else {
        bookmark = response['posts'][0];
        queryGPTForTags()
          .then(console.log)
          .catch(console.error);
      }

      $('input#title').val(bookmark['description']);

      if (bookmark['extended']) {
        if ($.trim(bookmark['extended']) !== $.trim(url_params['description'])) {
          $('textarea#description').val($.trim(bookmark['extended']) + '\n\n' + $.trim(url_params['description']));
        }
      }
      leave_a_gap();

      prepopulate_tags(bookmark['tags']);

      if (bookmark['shared'] === 'no') {
        $('#private').prop('checked', true).change();
      } else {
        $('#private').prop('checked', false);
      }

      if (bookmark['toread'] === 'yes') {
        $('#toread').prop('checked', true);
      } else {
        $('#toread').prop('checked', false);
      }

      if (bookmark['time']) {
        var date = new Date(bookmark['time']);
        showBookmarkTimestamp(date);
      }

      $('#submit').data('stateText', 'Update bookmark');
      $('#submit span.text').text('Update bookmark');
    })
    .fail(function(response) {
      if (response.status === 0) {
        display_critical_error('Unable to connect to the API. Please check your connection and try again.');
        display_reload_button();
      } else if (response.status === 401) {
        display_critical_error('401 Unauthorised. Please check the username and API access token you provided.');
      }
    });
  }

  /** Ensure window is tall enough to show all form elements. */
  function resize_window() {
    const min_width = 600;
    const min_height = 750;
    if (window.outerHeight < min_height) {
      window.resizeTo(min_width, min_height);
    }
    $(document).keydown(function(e) {
      close_window(e);
    });
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

  function display_critical_error(message) {
    alert(message);
    $('.helptext').remove();
    $('#submit').addClass('fail');
    $('#submit').prop('disabled', true);
    $('#mainspinner').addClass('hidden');
  }

  function display_reload_button() {
    $('#mainspinner').replaceWith('<button id="reload"><i class="fa fa-repeat"></i></button>');
    $('#reload').click(function(event) {
      event.preventDefault();
      $(this).addClass('active');
      window.location.reload();
    });
  }

  function reflect_private_status() {
    if ($('#private').prop('checked') === true) {
      $('body').addClass('private');
    } else {
      $('body').removeClass('private');
    }
  }

  function clean_title(title_string) {
    return title_string ? title_string.replace(/^▶ /, '') : '';
  }

  function leave_a_gap() {
    $('textarea#description').val($.trim($('textarea#description').val()));
    if ($('textarea#description').val() !== '') {
      $('textarea#description').val($('textarea#description').val() + '\n\n');
      $('textarea#description').animate({ scrollTop: '800' }, 1000); // scroll to bottom
    }
  }

  function remove_error_state_after_delay() {
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

  function prepopulate_tags(tag_string) {
    if (tag_string == '') {
      return;
    }
    $('input#tags').data('previous_tags', tag_string);

    var tags = tag_string.split(' ');
    for (var i = 0; i < tags.length; i++) {
      $('input#tags')[0].selectize.addOption({
        label: tags[i]
      });
      $('input#tags')[0].selectize.addItem(tags[i]);
      $('input#tags')[0].selectize.close(); // stop it from opening after these programmatic additions
    }

    $('#suggested button')
      .filter(function() {
        // don’t suggest tags that the bookmark already has
        return (
          $(this)
            .text()
            .toLowerCase() === tags[i]
        );
      })
      .remove();
  }

  function set_up_tag_autocomplete() {
    $('input#tags').selectize({
      delimiter: ' ',
      create: true,
      openOnFocus: false,
      maxOptions: 15,
      persist: true,
      createOnBlur: false,
      hideSelected: true,
      selectOnTab: false,
      diacritics: true,
      valueField: 'label',
      labelField: 'label',
      searchField: ['label', 'normalised_label'],
      score: function(search) {
        var score = this.getScoreFunction(search);

        return function(item) {
          return score(item) * (1 + item.count / 100);
        };
      },
      plugins: {
        remove_button: {
          title: 'Remove this tag'
        }
      },
      onEnterKeypress: function() {
        if (submission_block_timer === false) {
          // only if user is not entering tags
          $('#submit').click();
        }
      },
      onChange: function() {
        $('input#tags')[0].selectize.close();

        submission_block_timer = true;
        setTimeout(function() {
          submission_block_timer = false; // allow submission
        }, SUBMISSION_BLOCK_DELAY);
      },
      onItemAdd: function(value, $item) {
        $('.suggested_tag').each(function() {
          if ($(this).text() === value) {
            $(this).hide(400, function() {
              $(this).remove();
              remove_suggested_tag_separator();
            });
          }
        });
        $('input#tags')[0].selectize.close();
      },
      onItemRemove: function(value, $item) {
        append_suggested_tag(value);
      },
      render: {
        option: function(data, escape) {
          const count = data.count !== undefined ? escape(data.count) : '0';
          return `
            <div class="item">
              ${escape(data.label)}
              <span class="optioncount ${tagweight(escape(data.count))}">
                ${count}
              </span>
            </div>`;
        }
      }
    });

    populate_dropdown();
  }

  function populate_dropdown() {
    if (localStorage && localStorage['tags']) {
      var user_tags = JSON.parse(localStorage['tags']);
      console.log('Populating dropdown with ' + Object.keys(user_tags).length.toLocaleString() + ' tags.');
      $.each(user_tags, function(key, value) {
        $('input#tags')[0].selectize.addOption({
          label: key,
          normalised_label: key.replace(/[&-_\[\]#,+()$~%.'":*?<>{}]/g, ''),
          count: value
        });
      });
    }
  }

  function get_suggested_tags() {
    if (!url_params['url']) {
      return;
    }
    var suggested_tags_api =
      API_ENDPOINT + 'posts/suggest?format=json&auth_token=' + auth_token() + '&url=' + clean_url(url_params['url']);

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
    if (!tag_suggestions) {
      return;
    }
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
      if (
        (' ' + $('#tags').val().toLowerCase() + ' ').indexOf(' ' + tag_suggestions[i] + ' ') === -1
      ) {
        suggested_tags.push(
          '<button type="button" class="suggested_tag">' + pin_cook(tag_suggestions[i]) + '</button>'
        );
      }
    }

    if (suggested_tags.length > 0) {
      $('#suggested').append(suggested_tags.join(''));
      add_tag_remove_button_handlers($('#suggested button'));
      activate_suggested_tags();
      remove_suggested_tag_separator();
    } else {
      check_if_suggested_tags_are_empty();
    }
  }

  function add_tag_remove_button_handlers(selector) {
    (selector).on('click', function(event) {
      event.preventDefault();
      add_tag(pin_escape($(this).text()));

      $(this).hide(100, function() {
        $(this).remove();
        remove_suggested_tag_separator();
        check_if_suggested_tags_are_empty();
      });
    });
  }

  function check_if_suggested_tags_are_empty() {
    remove_suggested_tag_separator();
    if ($('#suggestion_row th').length === 0) {
      $('#suggestion_row th').hide(300);
      $('#suggested')
        .addClass('none')
        .text('No suggested tags for this page.');
    }
  }

  function activate_suggested_tags() {
    remove_suggested_tag_separator();
    if ($('#suggested button').length === 0) {
      $('#suggested')
      .removeClass('none')
      .text('');
    }
    $('#suggestion_row th').text('suggested tags');
  }

  function append_suggested_tag(tag) {
    activate_suggested_tags();
    $('#suggested').prepend('<button type="button" class="suggested_tag">' + pin_cook(tag) + '</button>');
    add_tag_remove_button_handlers($('#suggested button:first'));
  }

  /* Remove <hr> separator  if there are no tags on either side */
  function remove_suggested_tag_separator() {
    if (
      $('#suggested').children().length > 0 &&
      ($('#suggested')
        .children(':visible')
        .first()[0].tagName === 'HR' ||
        $('#suggested')
          .children(':visible')
          .last()[0].tagName === 'HR')
    ) {
      $('#suggested hr').hide(200, function() {
        $(this).remove();
      });
    }
    if ($('#suggested button').length === 0) {
      $('#suggestion_row th').hide(300);
      $('#suggested')
        .addClass('none')
        .text('No more suggested tags for this page.');
    }
  }

  function tagweight(count) {
    switch (true) {
      case count > 100:
        return 'tw100';
      case count > 50:
        return 'tw50';
      case count > 10:
        return 'tw10';
      case count > 1:
        return 'tw1';
    }
  }

  function pin_escape(s) {
    s = s.replace(/\\/g, '\\\\');
    s = s.replace(/'/g, "\\'"); // "
    s = s.replace(/"/g, '&quot;'); // "
    return s;
  }

  function pin_cook(s) {
    s = s.replace(/^\s+|\s+$/g, ''); // remove whitespace
    s = s.replace(/</g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    s = s.replace(/"/g, '&quot;'); //"
    return s;
  }

  function clean_url(url) {
    url = url.replace(/#.*$/, ''); // remove URL fragments and hashes
    return encodeURIComponent(url);
  }

  RegExp.escape = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\\\'"^$|#\s]/g, '\\$&'); //"'
  };

  function close_window(e) {
    if (e.keyCode === 27) {
      window.close();
    }
  }

  async function queryGPTForTags() {
    if (!url_params['openai_token']) {
      return;
    }
    const openai = new OpenAI({
      apiKey: url_params['openai_token'],
      dangerouslyAllowBrowser: true,
    });

    const system_prompt =
      'Return a comma-separated list containing suggested tags to use for bookmarking a page on the web. You will be provided an URL, and sometimes a title, a description or snippet from the page, and list of existing tags.  The format of your response should be a comma-separated list, for example: spying, russia, 1980s, nuclear_war, cold_war, history\n' +
      'The tags you suggest should all be in lowercase, with no surrounding whitespace. Use underscores instead of spaces to combine words if necessary. Avoid punctuation marks.\n' +
      "Think of the key concepts, people, subjects, brands, years/decades, publishers, websites, related concepts, etc. that are likely to be relevant to the page. Think of related or alternative concepts so you're not locked into a single meaning or interpretation. Don't over-emphasise the content of the description field, as this may just be a single paragraph or user comment from the page. There should be up to 14 tags, but only include ones that you are sure are relevant. Aim for at least 6. If you can't think of any tags, return an empty array. Remove any duplicate tags, or ones that are already present in the list of existing tags (the existingTags field). Finally, sort the tags and return them in ascending order of relevance.";

    existingTags =
      bookmark ? bookmark['tags'] : '';

    let contextInputs = {
      url: url_params['url'],
      title: url_params['title'],
      description: url_params['description'],
      existingTags: existingTags
    };

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 250,
      temperature: GPT_TEMPERATURE,
      messages: [
        { role: 'system', content: system_prompt },
        {
          role: 'user',
          content: 'Here are my inputs: ' + JSON.stringify(contextInputs),
        },
        { role: 'assistant', content: 'Here are my tag suggestions: ' },
      ],
    });

    if (completion.choices.length === 0) {
      return;
    }
    const responseMessage = completion.choices[0].message.content;
    let responseMessageCleaned = responseMessage.replace(/^\s+|\s+$/g, ''); // remove whitespace;
    // remove trailing comma
    if (responseMessageCleaned.endsWith(',')) {
      responseMessageCleaned = responseMessageCleaned.slice(0, -1);
    }
    const chat_suggested_tags = responseMessageCleaned.split(',');

    chat_suggested_tags.forEach((suggested_tag) => {
      append_suggested_tag(suggested_tag);
    });

    return responseMessage;
  }

  function showBookmarkTimestamp(date) {
    $('#bookmark-status')
      .attr('title', moment(date).format('dddd, MMMM Do YYYY, h:mma'))
      .text('Originally saved ' + moment(date).fromNow());
  }

  /** Submit the form with Ajax */
  function set_up_form_submission() {
    $('#post-to-pinboard').on('submit', function(event) {
      event.preventDefault();
      $('#submit span.text').html('Saving bookmark&hellip;');

      var post_bookmark_api =
        API_ENDPOINT + 'posts/add?format=json&auth_token=' + auth_token() + '&' + serialized_inputs();

      $.ajax({
        url: post_bookmark_api,
        type: 'GET',
        timeout: SUBMISSION_REQUEST_TIMEOUT,
        headers: {
          'Accept': 'application/json'
        }
      })
      .done(function(response) {
        if (response['result_code'] === 'done') {
          console.log('Bookmark saved correctly.');
          Ladda.stopAll();
          $('#submit').addClass('success');
          $('#submit span.text').text('Bookmark saved!');

          save_updated_user_tags();

          setTimeout(function() {
            window.close();
            setTimeout(function() {
              $('#submit').removeClass('success');
              $('#submit span.text').text($('#submit').data('stateText'));
              showBookmarkTimestamp(new Date());
            }, 300);
          }, 900);
        } else {
          handleApiError(response);
        }
      })
      .fail(handleApiError);
    });

    $('input, textarea').on('blur', function() {
      $('body').animate({ scrollTop: 0 }, 200);
    });

    if (!('ontouchstart' in window)) {
      $('input#tags')[0].selectize.focus(); // focus tags field for non-touch-based browsers
    }

    $('textarea#description').on('blur', function() {
      leave_a_gap();
    });

    $('#private').on('change', function() {
      reflect_private_status();
    });

    Ladda.bind('button[type=submit]');
  }

  function handleApiError(response) {
    Ladda.stopAll();
    $('.helptext').remove();
    $('#submit').addClass('fail');

    if (response['result_code'] === 'missing url') {
      $('label[for=url]')
        .addClass('error')
        .append('<span class="helptext"> is required</span>');
      $('#url').focus();
    } else if (response['result_code'] === 'must provide title') {
      $('label[for=title]')
        .addClass('error')
        .append('<span class="helptext"> is required</span>');
      $('#title').focus();
    } else if (response.status === 414) {
      $('label[for=description]')
        .addClass('error')
        .append('<span class="helptext"> is too long</span>');
      $('#description').addClass('expanded');
      $('#description').focus();
    } else if (response.status === 401) {
      display_critical_error('401 Unauthorised. Please check the username and API access token you provided.');
    } else {
      display_critical_error('An error occurred while saving the bookmark. Please try again.');
    }

    $('.helptext').fadeIn();
    remove_error_state_after_delay();
  }

  /** Remove default set of tags that are suggested by the Pinboard API when there are no good suggestions. */
  function remove_spurious_results(tag_suggestions) {
    const spuriousTags = [
      'ifttt',
      'facebook',
      'youtube',
      'objective-c',
      'twitter',
      'twitterlink',
      'wsh',
      '.from:twitter',
      '@codepo8',
      '1960s',
    ];
    const areAllSpuriousTagsPresent = spuriousTags.every(tag => tag_suggestions.includes(tag));
    return areAllSpuriousTagsPresent ? [] : tag_suggestions;
  }

  function remove_overly_common_tags(tag_suggestions) {
    var ignored_tags = [
      'bookmarks_bar',
      'pin-later',
      'unread',
      '*resources',
      'unlabeled',
      'via:packrati.us',
      'bookmarks_menu',
      '.from:twitter',
      'twitterlink',
      'from',
      'ifttt',
      'later',
      'saved',
      'read',
      'feedly',
      'for',
      'recently',
      'tobookmarks',
      'from:ifttt',
      'instapaper',
      '!fromtwitter',
      'feedbin',
      'favorites_bar',
      'imported',
      '.dailybrowse',
      'barra_dei_preferiti',
      'bookmarks_toolbar',
      'via:pocket',
      'from_pocket',
      'pocket',
      'archive',
      'toread',
      'readlater',
      'via:popular',
      '!tweet',
      'twitter-fav',
      'created-by:ifttt',
      'starred',
      'soon',
      'riposte',
      'github:starred',
      'iftttfeedly',
      'github-starred-to-pinboard',
      'appdotnet',
      'top',
      'instapaper:',
      '&amp;',
      '(popular',
      '--',
      'bookmarks)',
      'from:feedly',
      'from:rss',
      'instapaper:import',
      'instapaper:starred',
      '*',
      '**',
      '***',
      'instapaper:import',
      'googlereader',
      'no_tag',
      'evernote-web-clipper'
    ];
    tag_suggestions = $.grep(tag_suggestions, function(tag) {
      return $.inArray(tag.toLowerCase(), ignored_tags) === -1; // filter out matches
    });
    tag_suggestions = $.grep(tag_suggestions, function(tag) {
      return tag.toLowerCase().match(/^via:/) === null; // filter out all 'via:' tags
    });
    return tag_suggestions;
  }

  function rank_users_tags_higher(tag_suggestions) {
    if (!(localStorage && localStorage['tags'])) {
      return tag_suggestions;
    }

    var ranked_tags = [];
    var user_tags = JSON.parse(localStorage['tags']);
    var separator = true;

    $.each(tag_suggestions, function(index, tag) {
      if (user_tags.hasOwnProperty(tag)) {
        // user has used this tag before
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

  function prepare_user_tags() {
    if (!localStorage) {
      return;
    }
    if (!localStorage.tags) {
      download_user_tags();
    } else {
      console.log('Have a record of tags already, setting up delayed download.');
      setTimeout(function () {
        download_user_tags();
      }, TAG_DOWNLOAD_DELAY); // wait 10 seconds, then refresh tags
    }
  }

  function download_user_tags() {
    console.log("Downloading user's tags...");
    var all_tags_api = API_ENDPOINT + 'tags/get?format=json&auth_token=' + auth_token();

    $.ajax({
      url: all_tags_api,
      type: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
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
  }

  function save_updated_user_tags() {
    var user_tags = JSON.parse(localStorage['tags']);
    var potentially_new_tags = $('input#tags')
      .val()
      .split(' ');

    for (var i = 0; i < potentially_new_tags.length; i++) {
      if (user_tags[potentially_new_tags[i]]) {
        if (
          $('input#tags').data('previous_tags') &&
          $('input#tags')
            .data('previous_tags')
            .indexOf(potentially_new_tags[i]) !== -1
        ) {
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
})();
