module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    browserify: {
      dist: {
        files: {
          'build/module.js': ['popup.js'],
        }
      }
    },

    concat: {
      js: {
        options: {
          separator: ';'
        },
        src: [
          'vendor/spin.min.js',
          'vendor/ladda.min.js',
          'vendor/selectize.min.js',
          'build/module.js'
        ],
        dest: 'build/main.js'
      }
    },

    uglify: {
      options: {
        mangle: false,
        sourceMap: true,
        sourceMapIncludeSources: false,
        preserveComments: false
      },
      js: {
        files: {
          'public/js/scripts.min.js': ['build/main.js']
        }
      }
    },

    jshint: {
      files: [
        '*.js',
        '!node_modules/**/*',
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    less: {
      style: {
        files: {
          'build/main.css': 'popup.less'
        }
      }
    },

    cssmin: {
      combine: {
        files: {
          'build/merged.css':
          [
            'vendor/ladda.min.css',
            'vendor/selectize.css',
            'vendor/selectize.default.css',
            'build/main.css',
          ]
        }
      },
      minify: {
        src: 'build/merged.css',
        dest: 'public/css/style.min.css'
      }
    },

    watch: {
      js: {
        files: ['*.js', '.jshintrc'],
        tasks: ['browserify', 'concat:js', 'uglify:js'],
        options: {
          livereload: true,
        }
      },
      less: {
        files: ['*.less'],
        tasks: ['less:style'],
        options: {
          livereload: true,
        }
      },
      css: {
        files: 'build/main.css',
        tasks: ['cssmin:combine', 'cssmin:minify'],
        options: {
          livereload: true,
        }
      }
    },

    connect: {
      server: {},
    },
  });

  require('time-grunt')(grunt);

  require('load-grunt-tasks')(grunt);

  grunt.registerTask('default', ['browserify', 'concat:js', 'uglify:js', 'less:style', 'cssmin:combine', 'cssmin:minify', 'watch']);
};
