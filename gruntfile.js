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
      },
    },

    uglify: {
      options: {
        mangle: false,
        sourceMap: true,
      },
      js: {
        files: {
          'public/js/main.min.js': ['build/main.js']
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
          'public/css/style.css': 'popup.less'
        }
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
      css: {
        files: ['*.less'],
        tasks: ['less:style'],
        options: {
          livereload: true,
        }
      }
    },

    connect: {
      server: {},
    },
  });

  require('load-grunt-tasks')(grunt);

  grunt.registerTask('default', ['browserify', 'concat:js', 'uglify:js', 'watch']);
};
