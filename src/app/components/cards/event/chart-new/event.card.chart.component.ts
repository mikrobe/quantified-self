import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  NgZone,
  ElementRef,
  ViewChild,
} from '@angular/core';
import {Log} from 'ng2-logger/browser'
import {AppEventColorService} from '../../../../services/color/app.event.color.service';
import * as Raven from 'raven-js';
import {ActivityInterface} from 'quantified-self-lib/lib/activities/activity.interface';
import {EventInterface} from 'quantified-self-lib/lib/events/event.interface';
import {DataLongitudeDegrees} from 'quantified-self-lib/lib/data/data.longitude-degrees';
import {DataInterface} from 'quantified-self-lib/lib/data/data.interface';
import {PointInterface} from 'quantified-self-lib/lib/points/point.interface';
import {DataLatitudeDegrees} from 'quantified-self-lib/lib/data/data.latitude-degrees';
import {DataHeartRate} from 'quantified-self-lib/lib/data/data.heart-rate';
import * as am4core from '@amcharts/amcharts4/core';
import * as am4charts from '@amcharts/amcharts4/charts';

import am4themes_animated from '@amcharts/amcharts4/themes/animated';
import am4themes_material from '@amcharts/amcharts4/themes/material';
import am4themes_kelly from '@amcharts/amcharts4/themes/kelly';
import {combineLatest, EMPTY, Observable, Subscription} from 'rxjs';
import {EventService} from '../../../../services/app.event.service';
import {DataAltitude} from 'quantified-self-lib/lib/data/data.altitude';
import {map} from 'rxjs/operators';
import {StreamInterface} from 'quantified-self-lib/lib/streams/stream.interface';
import {DataAbsolutePressure} from 'quantified-self-lib/lib/data/data.absolute-pressure';
import {DataSeaLevelPressure} from 'quantified-self-lib/lib/data/data.sea-level-pressure';
import {DataCadence} from 'quantified-self-lib/lib/data/data.cadence';
import {DataPower} from 'quantified-self-lib/lib/data/data.power';
import {DataGPSAltitude} from 'quantified-self-lib/lib/data/data.altitude-gps';
import {DataSpeed} from 'quantified-self-lib/lib/data/data.speed';
import {DataVerticalSpeed} from 'quantified-self-lib/lib/data/data.vertical-speed';
import {isNumberOrString} from 'quantified-self-lib/lib/events/utilities/event.utilities';
import {number} from '@amcharts/amcharts4/core';


// am4core.useTheme(am4themes_animated);
// am4core.useTheme(am4themes_material);

// am4core.useTheme(am4themes_kelly);

@Component({
  selector: 'app-event-card-chart-new',
  templateUrl: './event.card.chart.component.html',
  styleUrls: ['./event.card.chart.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardChartNewComponent implements OnChanges, OnInit, OnDestroy, AfterViewInit {

  @ViewChild('chartDiv') chartDiv: ElementRef;
  @Input() event: EventInterface;
  @Input() selectedActivities: ActivityInterface[] = [];
  @Input() isVisible: boolean;
  @Input() showAdvancedStats: boolean;

  private streamsSubscription: Subscription;
  private chart: am4charts.XYChart;
  private logger = Log.create('EventCardChartComponent');

  constructor(private  changeDetector: ChangeDetectorRef,
              private zone: NgZone,
              private eventService: EventService,
              private eventColorService: AppEventColorService) {
  }

  ngAfterViewInit() {

  }

  async ngOnInit() {

  }

  async ngOnChanges(simpleChanges) {
    debugger;
    // If it does not have a chart create no matter what change happened
    if (!this.chart) {
      this.chart = await this.createChart();
    }

    if (simpleChanges.event || simpleChanges.selectedActivities || simpleChanges.showAdvancedStats) {
      debugger;
      this.bindToNewData();
    }
  }

  private bindToNewData() {
    this.unSubscribeFromAll();
    this.streamsSubscription = combineLatest(this.selectedActivities.map((activity) => {
      let allOrSomeSubscription = this.eventService.getStreams(
        this.event.getID(), activity.getID(),
        [
          // DataHeartRate.type,
          DataAltitude.type,
          DataAbsolutePressure.type,
          DataSeaLevelPressure.type,
          // DataCadence.type,
          // DataPower.type,
          // DataGPSAltitude.type,
          // DataSpeed.type,
          // DataVerticalSpeed.type,
        ],
      );
      if (this.showAdvancedStats){
        allOrSomeSubscription  = this.eventService.getAllStreams(this.event.getID(), activity.getID());
      }

      return allOrSomeSubscription.pipe(map((streams) => {
        if (!streams.length) {
          return [];
        }
        // debugger;
        return streams.map((stream) => {
          let series = this.chart.series.values.find((series) => {
            return `${activity.getID()}${stream.type}` === series.id
          });

          if (!series) {
            // debugger;
            series = new am4charts.LineSeries();
            series.id = `${activity.getID()}${stream.type}`;
            series.name = stream.type + ` ${activity.creator.name}`;
            series.dataFields.valueY = "value";
            series.dataFields.dateX = "date";
            series.hidden = true;
            // debugger;

            // hide all except the first one
            // if (this.chart.series.length > 1) {
            //   series.hide()
            // }

            // series.minDistance = 1;
            // series.strokeWidth = 3;
            series.fillOpacity = 0.6;
            series.interactionsEnabled = false;
            // debugger;
          }

          // @todo for performance this should be moved to the other pipe
          const samplingRate = this.getSamplingRateInSeconds(stream.data.length);
          this.logger.d(`Stream data for ${stream.type} length before sampling ${stream.data.length}`)
          const data  = stream.data.reduce((dataArray: {date: Date, value: number}[], streamData, index) => {
            // Slice the data dirty for now till performance is achieved
            dataArray.push({
              date: new Date(activity.startDate.getTime() + (index * 1000)),
              value: streamData,
            });
            return dataArray
          }, [])
            .filter((data) => isNumberOrString(data.value))
            .filter((data, index) => index % samplingRate === 0);

          this.logger.d(`Stream data for ${stream.type} after sampling and filtering ${data.length}`);

          // debugger;
          series.data = data;
          return series
        });
      }))
    })).pipe(map((seriesArrayOfArrays) => {
      // debugger;
      return seriesArrayOfArrays.reduce((accu: [], item: []): am4charts.XYSeries[] => accu.concat(item), [])
    })).subscribe((series: am4charts.XYSeries[]) => {
      // debugger;
      series.forEach((serrie, index) => {
        // if (index > 4) {
        //   serrie.hide()
        // }
      });
      // Perhaps here pass all data as one from all series to the chart

      this.chart.series.setAll(series);
      this.chart.invalidateData();
    });
  }

  private createChart(): Promise<am4charts.XYChart> {
    return new Promise((resolve, reject) => {
      this.zone.runOutsideAngular(() => {
        const chart = am4core.create(this.chartDiv.nativeElement, am4charts.XYChart);
        chart.pixelPerfect = false;
        // chart.fontSize = '12px';
        // chart.resizable = false;
        const dateAxis = chart.xAxes.push(new am4charts.DateAxis());
        dateAxis.title.text = "Time";
        // dateAxis.baseInterval = {
        //   timeUnit: "second",
        //   count: this.getSamplingRateInSeconds(this.selectedActivities),
        // };
        const valueAxis = chart.yAxes.push(new am4charts.ValueAxis());

        chart.legend = new am4charts.Legend();
        chart.cursor = new am4charts.XYCursor();
        chart.cursor.fullWidthLineX = true;

        // Add watermark
        const watermark = new am4core.Label();
        watermark.text = "Quantified Self (https://quantified-self.io)";
        chart.plotContainer.children.push(watermark);
        watermark.align = "right";
        watermark.valign = "bottom";
        watermark.fontSize = 20;
        watermark.opacity = 0.9;
        watermark.marginRight = 10;
        watermark.marginBottom = 5;
        // watermark.zIndex = 100;
        watermark.fontWeight = 'bold';


        chart.events.on('validated', (ev) => {
          this.logger.d('validated');
        });

        chart.events.on('visibilitychanged', (ev) => {
          this.logger.d('visibilitychanged');
        });

        // Warning the below breaks zoom (till fixed
        // chart.events.on('resize', (ev) => {
        //   this.logger.d('resize');
        // });

        chart.events.on('hidden', (ev) => {
          this.logger.d('hidden');
        });
        chart.events.on('shown', (ev) => {
          this.logger.d('shown');
        });

        chart.events.on('inited', (ev) => {
          this.logger.d('inited');
        });

        chart.events.on('datavalidated', (ev) => {
          // this.logger.d('datavalidated');
          var chart: am4charts.XYChart = ev.target;
          var categoryAxis = chart.yAxes.getIndex(0);
          this.logger.d(chart.svgContainer.htmlElement.offsetHeight.toFixed());
          this.logger.d(categoryAxis.pixelHeight.toFixed());
          chart.svgContainer.htmlElement.style.height = chart.svgContainer.htmlElement.offsetHeight + categoryAxis.pixelHeight + 'px';
          chart.svgContainer.htmlElement.style.height = chart.svgContainer.htmlElement.offsetHeight + categoryAxis.pixelHeight + 'px';
        });
        resolve(chart);
      });
    });
  }

  private getSamplingRateInSeconds(numberOfSamples: number): number {
    let samplingRate = 1;
    // Each sample is 1s so x number is x seconds
    const hoursToKeep1sSamplingRate = 2; // 2 hours
    const numberOfSamplesToHours = numberOfSamples / 3600;
    // If we are in less than 3 hours return 1s sampling rate
    if (numberOfSamplesToHours > hoursToKeep1sSamplingRate) {
      samplingRate = Math.ceil((numberOfSamplesToHours  * 2.5 )/ hoursToKeep1sSamplingRate)
    }
    this.logger.d(`${numberOfSamples} are about ${numberOfSamplesToHours} hours. Sampling rate is ${samplingRate}`);
    return samplingRate;
  }


  // private getChartData(): { series: am4charts.LineSeries[], data: any[] } {
  //   const chartData = {series: [], data: []};
  //   // Use a map for quick lookup
  //   const data = new Map<number, any>();
  //   // Parse the series while constructing data
  //   this.selectedActivities
  //     .forEach((activity: ActivityInterface, index) => {
  //       activity.getPointsInterpolated(void 0, void 0).forEach((point: PointInterface) => {
  //         point.getData().forEach((pointData: DataInterface, key: string) => {
  //           if ([DataLatitudeDegrees.type, DataLongitudeDegrees.type].indexOf(key) > -1) {
  //             return;
  //           }
  //
  //           let existingLineSeries: am4charts.LineSeries = chartData.series.find(lineSeries => lineSeries.id === pointData.getClassName() + activity.getID());
  //
  //           if (!existingLineSeries) {
  //             existingLineSeries = new am4charts.LineSeries();
  //             existingLineSeries.id = pointData.getClassName() + activity.getID();
  //             existingLineSeries.name = key + ' (' + activity.creator.name + ')';
  //
  //             existingLineSeries.dataFields.dateX = 'date';
  //             existingLineSeries.dataFields.valueY = pointData.getClassName() + activity.getID();
  //             if (key !== DataHeartRate.type) {
  //               existingLineSeries.hidden = true;
  //             }
  //             existingLineSeries.tooltipText = activity.creator.name + ' ' + pointData.getType() + '{valueY} ' + pointData.getDisplayUnit();
  //             existingLineSeries.legendSettings.labelText = '{name}';
  //             existingLineSeries.legendSettings.itemValueText = '{valueY} ' + pointData.getDisplayUnit();
  //             existingLineSeries.defaultState.transitionDuration = 0;
  //
  //             existingLineSeries.strokeWidth = 1;
  //             existingLineSeries.fillOpacity = 0.05;
  //             // existingLineSeries.nonScalingStroke = false;
  //             if (pointData.getType() === DataHeartRate.type) {
  //               existingLineSeries.stroke = am4core.color(this.eventColorService.getActivityColor(this.event, activity));
  //             }
  //             chartData.series.push(existingLineSeries);
  //           }
  //
  //           let existingData = data.get(point.getDate().getTime());
  //           if (!existingData) {
  //             existingData = {};
  //             data.set(point.getDate().getTime(), existingData);
  //           }
  //           existingData[pointData.getClassName() + activity.getID()] = pointData.getDisplayValue();
  //         });
  //       });
  //     });
  //
  //   // Flatten
  //   data.forEach(((value, key, map) => {
  //     chartData.data.push(Object.assign({date: new Date(key)}, value))
  //   }));
  //   return chartData;
  // }

  private destroyChart() {
    try {
      this.zone.runOutsideAngular(() => {
        if (this.chart) {
          this.chart.dispose();
        }
      });
    } catch (e) {
      this.logger.error('Could not destroy chart');
      // Log to Sentry
      Raven.captureException(e);
    }
  }


  ngOnDestroy() {
    this.destroyChart();
    this.unSubscribeFromAll();
  }

  private unSubscribeFromAll() {
    if (this.streamsSubscription) {
      this.streamsSubscription.unsubscribe();
    }
  }
}
