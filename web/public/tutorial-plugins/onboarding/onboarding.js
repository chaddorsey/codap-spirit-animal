// ==========================================================================
//  
//  Author:   wfinzer
//
//  Copyright (c) 2017 by The Concord Consortium, Inc. All rights reserved.
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.
// ==========================================================================
/* jshint strict: false */

/*global console:true,iframePhone:true,React:true, ReactDOM:true */

/**
 * Shows either a welcome, a help movie, or feedback
 */
class HelpWelcomeArea extends React.Component {
  render() {
    let tResult = '';
    switch (this.props.whichFeedback) {
      case 'welcome':
        tResult = React.createElement(
          'div',
          { className: 'App-header-welcome' },
          React.createElement('img', { src: './resources/codap_logo.png', className: 'App-logo', alt: 'logo' }),
          React.createElement(
            'h2',
            null,
            tr("~header.welcome")
          )
        );
        break;
      case 'movie':
        tResult = React.createElement(
          'div',
          { className: 'App-header-movie' },
          React.createElement(
            'video',
            { id: 'movieVideo', className: 'App-movie', autoPlay: true, onEnded: this.props.handleEnded },
            React.createElement('source', { src: this.props.movieURL, type: 'video/mp4' })
          )
        );
        break;
      case 'feedback':
        tResult = React.createElement(
          'div',
          { className: 'App-header-feedback' },
          this.props.feedbackText
        );
        break;
      default:
        tResult = React.createElement('div', { className: 'App-header-empty' });
    }
    return tResult;
  }
}

class HelpLink extends React.Component {

  constructor(props) {
    super(props);
    this.handleHelpClick = this.handleHelpClick.bind(this);
  }

  handleHelpClick() {
    // DOT-FORK 1/5: the wrapper needs the TASK KEY, not just a movie URL.
    this.props.handleHelpClick(this.props.helpURL, this.props.taskKey);
  }

  render() {
    return React.createElement(
      'scan',
      { className: 'App-help', onClick: this.handleHelpClick },
      tr("~show.me.text")
    );
  }
}

/**
 * Shows an icon that can be dragged into CODAP to import data
 */
class DraggableLink extends React.Component {
  constructor(props) {
    super(props);
    this.handleDragStart = this.handleDragStart.bind(this);
  }

  handleDragStart(event) {
    let dt = event.dataTransfer,
        tUrl = window.location.href.replace(/\/[^\/]*$/, "") + "/resources/" + resourceDir() + tr("~onboarding1.mammals.file.and.table.title");
    let ix;
    for (let i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === 'file') {
        ix = i;
      }
    }
    if (ix != null) {
      dt.items.remove(ix);
    }
    dt.setData('text/uri-list', tUrl);
    dt.setData('text', tUrl);
    dt.effectAllowed = 'all';
  }

  render() {
    return React.createElement(
      'span',
      { className: 'App-link' },
      React.createElement('img', { src: './resources/text-icon.png', alt: 'link', width: 50,
        onDragStart: this.handleDragStart, draggable: true
      })
    );
  }
}

/**
 * Shows the list of tasks as checkbox items, checking the ones that have so far been completed.
 */
class TaskList extends React.Component {

  disableClick() {
    return false;
  }

  render() {
    let checkBoxes = taskDescriptions.descriptions.map(function (iAction, iIndex) {
      let tIcon = iAction.key === 'Drag' ? React.createElement(DraggableLink, null) : '',
          // Special case the data file checkbox
      tChecked = this.props.accomplished.indexOf(iAction.key) >= 0;
      return React.createElement(
        'div',
        { key: iAction.key },
        React.createElement('input', { className: 'App-checkbox', type: 'checkbox', onClick: function () {
            return false;
          }, name: iAction.key, checked: tChecked
        }),
        tIcon,
        iAction.label,
        ' ',
        React.createElement(HelpLink, { helpURL: iAction.url,
          taskKey: iAction.key,                    // DOT-FORK 2/5
          handleHelpClick: this.props.handleHelpClick }),
        ' ',
        React.createElement('br', null)
      );
    }.bind(this));
    return React.createElement(
      'div',
      { className: 'App-list' },
      checkBoxes
    );
  }
}

class TutorialView extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      // DOT-FORK 9: the first task is done before the student arrives.
      //
      // Its data is imported for them at startup (see the note by the
      // `dataContextFromURL` call) because CODAP v3.1.0 cannot complete a url
      // drop, so the box has to start ticked or the tutorial would show a task
      // nobody — student or Dot — can ever finish.
      //
      // Read from `descriptions[0]` rather than hard-coding 'Drag': the first
      // task is 'Drag' with a mouse and 'MakeTable' without, and both are
      // satisfied by the same import.
      accomplished: (onboarding1 && taskDescriptions.descriptions.length)
        ? [taskDescriptions.descriptions[0].key] : [],
      codapPresent: false,
      whichFeedback: 'welcome',
      movieURL: '',
      feedbackText: '',
      allAccomplished: false,
      onboardingComplete: false
    };
    this.handleHelpClick = this.handleHelpClick.bind(this);
    this.handleCodapNotification = this.handleCodapNotification.bind(this);
    this.handleInfoClick = this.handleInfoClick.bind(this);
    this.handleOtherNotification = this.handleOtherNotification.bind(this);

    codapInterface.on('notify', 'documentChangeNotice', this.handleCodapNotification);
    codapInterface.on('notify', 'component', this.handleCodapNotification);
    codapInterface.on('notify', '*', this.handleOtherNotification);

    // DOT-FORK 5/5: the MP4 is the floor. A demo that fails, or a demo asked
    // for while another is running, must never leave the student with a dead
    // link — the first plays the canned movie, the second says so and stops.
    // DOT-FORK 6/6: v3 sends NO notification when a data context appears.
    // Measured on CODAP v3.1.0 (2985): a successful import took the document
    // from 2 data contexts to 3 and the plugin's own `notify *` channel saw
    // nothing at all — so `dataContextCountChanged`, which the `Drag` task
    // waits for, never arrives and that task can never check itself off. This
    // poll is the fork's stand-in; it stops as soon as the task is done.
    // Reported for Chad in docs/verification/phase9/BAILOUTS.md — it very
    // likely affects the official v3 tutorials too.
    this.dotContextBaseline = null;
    this.dotTaskPoll = setInterval(function () {
      if (window.DotShowMe && window.DotShowMe.demoInProgress) return;
      var wantsDrag = taskDescriptions.taskExists('Drag') && !this.isAccomplished('Drag');
      var wantsAttrs = (taskDescriptions.taskExists('AssignAttribute')
                         && !this.isAccomplished('AssignAttribute'))
                    || (taskDescriptions.taskExists('SecondAttribute')
                         && !this.isAccomplished('SecondAttribute'))
                    || (taskDescriptions.taskExists('MakeScatterplot')
                         && !this.isAccomplished('MakeScatterplot'));
      if (!wantsDrag && !wantsAttrs) { clearInterval(this.dotTaskPoll); return; }

      // DOT-FORK 8/8: on v3 a `dataContextFromURL` import opens NO case table
      // (measured: tutorial 2 came up with the nhanes context loaded and not a
      // single attribute pill on screen, so there was nothing to drag onto an
      // axis and the tutorial could not be completed at all). v2 opened one.
      //
      // This lives in the POLL, not in the import's `.then`, because that
      // reply is dropped often enough to matter — hanging the fix off it left
      // the table unopened on two runs out of three. Nothing here depends on a
      // reply arriving.
      var openBoundTable = function () {
        codapInterface.sendRequest({ action: 'get', resource: 'dataContextList' })
          .then(function (iCtx) {
            var first = ((iCtx && iCtx.values) || [])[0];
            if (!first) return;
            codapInterface.sendRequest({
              action: 'create', resource: 'component',
              values: { type: 'caseTable', dataContext: first.name,
                        position: { left: 420, top: 5 },
                        dimensions: { width: 560, height: 260 } },
            });
          });
      };
      codapInterface.sendRequest({ action: 'get', resource: 'componentList' })
        .then(function (iList) {
          if (!iList || !iList.success) return;
          var table = (iList.values || []).find(function (c) {
            return /caseTable/i.test(c.type);
          });
          if (!table) return openBoundTable();
          // A table created too soon after the import comes up UNBOUND: no
          // columns, no attribute pills, and — the tell we can check without
          // reaching into CODAP's DOM — no `dataContext` in its own props.
          // Replace it; an unbound table is worse than none, because the
          // student sees a table and still cannot drag anything out of it.
          codapInterface.sendRequest({ action: 'get',
            resource: 'component[' + table.id + ']' }).then(function (iProps) {
              if (!iProps || !iProps.success) return;
              if (iProps.values && iProps.values.dataContext) return;   // bound, fine
              codapInterface.sendRequest({ action: 'delete',
                resource: 'component[' + table.id + ']' }).then(openBoundTable);
            });
        });

      if (wantsDrag) {
        codapInterface.sendRequest({ action: 'get', resource: 'dataContextList' })
          .then(function (iResult) {
            if (!iResult || !iResult.success) return;
            var n = (iResult.values || []).length;
            if (this.dotContextBaseline === null) { this.dotContextBaseline = n; return; }
            if (n > this.dotContextBaseline) {
              this.dotContextBaseline = n;
              this.handleAccomplishment('Drag');
            }
          }.bind(this));
      }

      if (wantsAttrs) {
        // Same rule upstream applies on `attributeChange`, but driven by a poll
        // rather than by that notification's async chain, which does not fire
        // dependably on v3 — see docs/verification/phase9/BAILOUTS.md. A drag
        // that visibly landed Mass on the x axis left the task unchecked, while
        // invoking the very same handler by hand checked it immediately.
        codapInterface.sendRequest({ action: 'get', resource: 'componentList' })
          .then(function (iResult) {
            if (!iResult || !iResult.success) return;
            var reqs = (iResult.values || [])
              .filter(function (c) { return c.type === 'graph'; })
              .map(function (c) { return { action: 'get', resource: 'component[' + c.id + ']' }; });
            if (!reqs.length) return;
            codapInterface.sendRequest(reqs).then(function (iResults) {
              var maxAttrs = 0;
              (iResults || []).forEach(function (r) {
                var n = 0;
                ['xAttributeName', 'yAttributeName', 'y2AttributeName', 'legendAttributeName']
                  .forEach(function (k) { if (r.values && r.values[k]) n++; });
                maxAttrs = Math.max(maxAttrs, n);
              });
              if (maxAttrs >= 2) {
                if (taskDescriptions.taskExists('MakeScatterplot')) {
                  this.handleAccomplishment('MakeScatterplot');
                }
                this.handleAccomplishment('SecondAttribute');
              }
              if (maxAttrs >= 1 && taskDescriptions.taskExists('AssignAttribute')) {
                this.handleAccomplishment('AssignAttribute');
              }
            }.bind(this));
          }.bind(this));
      }
    }.bind(this), 4000);   // gently: every poll competes with the demo for the phone

    // `class` declarations are not properties of `window`, so without this
    // the checklist's state is unreachable from the wrapper — and the P3
    // acceptance tests have to be able to read it.
    window.__dotTutorialView = this;
    if (window.DotShowMe) {
      window.DotShowMe.onError = function (iKey, iMovieURL, iReason) {
        // DOT-FORK: say WHY. Diagnosing the attribute drag cost several rounds
        // of asking Chad to fish the reason out of the console by hand.
        window.console && console.log('[dot] demo failed for ' + iKey
          + ' — playing the movie — REASON: ' + (iReason || 'not reported'));
        if (iMovieURL) this.playMovie(iMovieURL);
      }.bind(this);
      window.DotShowMe.onBusy = function (iKey) {
        window.console && console.log('[dot] busy — ' + iKey + ' not started; link still live');
      };
      window.DotShowMe.onStateChange = function () {
        this.forceUpdate();
      }.bind(this);
    }
  }

  allAccomplished() {
    return taskDescriptions.descriptions.every(function (iDesc) {
      return this.state.accomplished.indexOf(iDesc.key) >= 0;
    }.bind(this));
  }

  isAccomplished(iKey) {
    return this.state.accomplished.some(function (iAccomplishment) {
      return iAccomplishment === iKey;
    });
  }

  handleAccomplishment(iAccomplishment, iQualifier) {
    // DOT-FORK 4/5: Dot's demonstration is not the student's work. Every
    // completion path funnels through here, so this one gate covers both the
    // component notifications and the generic operation matcher.
    if (window.DotShowMe && window.DotShowMe.demoInProgress) {
      window.console && console.log('[dot] suppressed self-check for '
        + iAccomplishment + ' (demo in progress)');
      return;
    }
    if (taskDescriptions.taskExists(iAccomplishment) && !this.isAccomplished(iAccomplishment)) {
      this.addAccomplishment(iAccomplishment);
      let tFeedback = taskDescriptions.getFeedbackFor(iAccomplishment, iQualifier, this.allAccomplished());
      if (this.state.whichFeedback === 'feedback') {
        this.setState({
          feedbackText: '',
          whichFeedback: ''
        });
        setTimeout(function () {
          this.setState({
            feedbackText: tFeedback,
            whichFeedback: 'feedback'
          });
        }.bind(this), 0);
      } else {
        this.setState({
          feedbackText: tFeedback,
          whichFeedback: 'feedback'
        });
      }
    }
  }

  handleOtherNotification(iNotification) {
    // DOT-FORK 7/7: gate at the NOTIFICATION, not just at the accomplishment.
    // handleAttributeChange() below does async round trips before it decides
    // anything, so a notification that arrives DURING a demo can finish its
    // chain after suppression has lifted and check the task off anyway. That
    // race is visible to a student as Dot's demonstration ticking their box.
    if (window.DotShowMe && window.DotShowMe.demoInProgress) return { success: true };
    // Is the operation and type in the task descriptions. If so, we can treat it generically
    let tTask = taskDescriptions.descriptions.find(function (iDescription) {
      return iDescription.operation === iNotification.values.operation && !iDescription.requiresSpecialHandling && (!iDescription.prereq || this.isAccomplished(iDescription.prereq) && (!iDescription.constraints || iDescription.constraints.some(function (iConstraint) {
        let isBool = typeof iConstraint.value === 'boolean',
            tNotificationHasResult = Boolean(iNotification.values.result),
            tNotificationValue;
        if (tNotificationHasResult) {
          tNotificationValue = isBool ? Boolean(iNotification.values.result[iConstraint.property]) : iNotification.values.result[iConstraint.property];
        } else {
          tNotificationValue = iNotification.values[iConstraint.property];
        }
        return tNotificationValue === iConstraint.value;
      })));
    }.bind(this));
    if (tTask) {
      this.handleAccomplishment(tTask.key);
    }
    return { success: true };
  }

  handleCodapNotification(iNotification) {
    // DOT-FORK 7/7 (see handleOtherNotification): drop it on arrival.
    if (window.DotShowMe && window.DotShowMe.demoInProgress) return { success: true };

    let tHandled = false,
        handleAttributeChange = function () {
      // If there is a graph with two or more attributes then 'SecondAttribute' else 'AssignAttribute'
      // Note that dropping a legend attribute doesn't trigger this notification!
      codapInterface.sendRequest({
        action: 'get',
        resource: 'componentList'
      }).then(function (iResult) {
        if (iResult.success && iResult.values.length > 1) {
          let tGraphRequestList = [];
          iResult.values.forEach(function (iComponent) {
            if (iComponent.type === 'graph') {
              tGraphRequestList.push({
                action: 'get',
                resource: 'component[' + iComponent.id + ']'
              });
            }
          });
          if (tGraphRequestList.length > 0) {
            codapInterface.sendRequest(tGraphRequestList).then(function (iResults) {
              let maxAttrsFound = 0;
              iResults.forEach(function (iResult) {
                let numAttrsFound = 0;
                ['xAttributeName', 'yAttributeName', 'y2AttributeName', 'legendAttributeName'].forEach(function (iKey) {
                  if (iResult.values[iKey]) numAttrsFound++;
                });
                maxAttrsFound = Math.max(maxAttrsFound, numAttrsFound);
              });
              switch (maxAttrsFound) {
                case 1:
                  if (taskDescriptions.taskExists('AssignAttribute')) this.handleAccomplishment('AssignAttribute');
                  break;
                case 2:
                  if (taskDescriptions.taskExists('MakeScatterplot')) this.handleAccomplishment('MakeScatterplot');
                // fallthrough deliberate
                case 3:
                  this.handleAccomplishment('SecondAttribute');
                  break;
              }
            }.bind(this));
          }
        }
      }.bind(this));
    }.bind(this),
        handleLegendAttributeChange = function () {
      if (iNotification.values.type === 'DG.GraphModel' && iNotification.values.attributeName === tr("~legend.attribute")) this.handleAccomplishment('MakeLegend');
    }.bind(this),
        handleDataContextCountChanged = function () {
      codapInterface.sendRequest({
        action: 'get',
        resource: 'dataContextList'
      }).then(function (iResult) {
        if (iResult.success && iResult.values.length > 1) {
          let tName = iResult.values[0].name;
          codapInterface.sendRequest({
            action: 'delete',
            resource: 'dataContext[' + tName + ']'
          });
        }
      });
      this.handleAccomplishment('Drag');
    }.bind(this);

    switch (iNotification.values.operation) {
      case 'dataContextCountChanged':
        handleDataContextCountChanged();
        break;
      case 'create':
        if (iNotification.values.type === 'graph') this.handleAccomplishment('MakeGraph', !this.isAccomplished('Drag'));else if (iNotification.values.type === 'table') this.handleAccomplishment('MakeTable', !this.isAccomplished('Drag'));
        break;
      case 'move':
        if (iNotification.values.type === 'DG.GraphView' || iNotification.values.type === 'DG.TableView') this.handleAccomplishment('MoveComponent');
        break;
      case 'attributeChange':
        handleAttributeChange();
        break;
      /*
            case 'legendAttributeChange':
              handleLegendAttributeChange();
      */
    }
    return { success: true };
  }

  playMovie(movieURL) {
    this.setState({ movieURL: '', whichFeedback: '' });
    setTimeout(function () {
      this.setState({ movieURL: movieURL, whichFeedback: 'movie' });
    }.bind(this), 10);
  }

  handleHelpClick(movieURL, taskKey) {
    // DOT-FORK 3/5: when the wrapper has handshaken, Dot performs the task
    // live in the student's own document instead of playing a canned movie.
    // Any failure downstream comes back as dot-demo-error and lands on
    // playMovie() below — the MP4 remains the floor, never worse than today.
    if (!(window.DotShowMe && window.DotShowMe.showMe(taskKey, movieURL))) {
      this.playMovie(movieURL);
    }
    codapInterface.sendRequest({
      action: 'notify',
      resource: 'logMessage',
      values: {
        formatStr: "User clicked ShowMe for %@",
        replaceArgs: [movieURL]
      }
    });
  }

  addAccomplishment(iKey) {
    let accomplished = this.state.accomplished.slice(),
        index = accomplished.indexOf(iKey);
    if (index < 0) accomplished.push(iKey);
    this.setState({ accomplished: accomplished });
  }

  startOver() {
    window.parent.location.reload();
  }

  handleInfoClick() {
    this.setState({
      feedbackText: infoFeedback,
      whichFeedback: 'feedback'
    });
  }

  render() {
    let tHelp = this.state.whichFeedback === '' ? '' : React.createElement(HelpWelcomeArea, {
      movieURL: this.state.movieURL,
      feedbackText: this.state.feedbackText,
      whichFeedback: this.state.whichFeedback
    });
    this.taskList = React.createElement(TaskList, {
      accomplished: this.state.accomplished,
      handleHelpClick: this.handleHelpClick
    });

    return React.createElement(
      'div',
      { className: 'App' },
      tHelp,
      React.createElement(
        'p',
        { className: 'App-intro' },
        tr("~list.title")
      ),
      React.createElement(
        'div',
        { className: 'App-taskarea' },
        this.taskList
      ),
      React.createElement('img', { src: './resources/infoIcon.png', className: 'App-info',
        onClick: this.handleInfoClick })
    );
  }
}

function getStarted() {

  codapInterface.init({
    title: tr("~onboarding1.plugin.title"),
    version: "2.0",
    dimensions: {
      width: 400,
      height: 550
    },
    preventDataContextReorg: false
  }).catch(function (msg) {
    console.log(msg);
  });

  // DOT-FORK 9: load the csv for tutorial 1 as well, not only on touch devices.
  //
  // The original condition says: tutorial 2 always imports; tutorial 1 imports
  // only when there is no mouse, because a student with a mouse is supposed to
  // drag the file icon in themselves. That task cannot be completed on CODAP
  // v3.1.0 by anybody. Measured 2026-08-27 on STOCK codap3.concord.org, no
  // proxy and no wrapper, dropping an https csv that serves
  // `access-control-allow-origin: *`: CODAP routes the drop correctly and
  // launches its Importer plugin, but the Importer's handshake with CODAP times
  // out ("sendRequest on not yet initialized CODAP connection" ->
  // "CODAP request timed out"), so it never receives the url and sits there
  // prompting "Enter url:". No dataset ever arrives. Not our bug and not
  // fixable from here.
  //
  // So treat a broken drop the way this file already treats a device that
  // cannot drag: bring the data in and tick the task off. `getStarted` marks it
  // accomplished, and the DOT-FORK 8/8 poll below opens the case table that v3
  // does not open by itself. The student begins where the tutorial's
  // demonstrable content begins.
  if (true) {
    csvToLoad = (onboarding1 ? tr("~onboarding1.mammals.file.and.table.title") : tr("~onboarding2.nhanes.file.and.table.title"));
    var dataContextTitle = (onboarding1 ? tr("~onboarding1.mammals.table.title") : tr("~onboarding2.nhanes.table.title"));
    codapInterface.sendRequest({
      action: 'create',
      resource: 'dataContextFromURL',
      values: {
        URL: window.location.href.replace(/\/[^\/]*$/, "") + "/resources/" + resourceDir() + csvToLoad,
        title: dataContextTitle
      }
    }).then(function (iResult) {
      console.log('Created data context from URL');
    });
  }

  ReactDOM.render(React.createElement(TutorialView, null), document.getElementById('container'));
}

getStarted();

