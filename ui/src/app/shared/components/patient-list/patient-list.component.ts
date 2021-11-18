import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, of } from 'rxjs';
import { take, tap } from 'rxjs/operators';
import { AppState } from 'src/app/store/reducers';
import { Patient } from '../../resources/patient/models/patient.model';
import { Visit } from '../../resources/visits/models/visit.model';
import { VisitsService } from '../../resources/visits/services';

import { map, uniq } from 'lodash';
import { upsertAdmittedPatientLocation } from 'src/app/store/actions/visit.actions';
import { ActivatedRoute, Router } from '@angular/router';
import { clearBills } from 'src/app/store/actions/bill.actions';
import { clearBillItems } from 'src/app/store/actions/bill-item.actions';
import { PatientListDialogComponent } from '../../dialogs';
import { MatDialog } from '@angular/material/dialog';
import { go } from 'src/app/store/actions';

@Component({
  selector: 'app-patient-list',
  templateUrl: './patient-list.component.html',
  styleUrls: ['./patient-list.component.scss'],
})
export class PatientListComponent implements OnInit, OnChanges {
  @Input() currentLocation: any;
  @Input() isTabularList: boolean;
  @Input() visits: Visit[];
  @Input() shouldShowParentLocation: boolean;
  @Input() service: string;
  @Input() itemsPerPage: number;
  @Input() isRegistrationPage: boolean;
  @Input() defaultFilter: string;
  @Input() orderType: string;
  @Input() orderStatus: string;
  @Input() orderStatusCode: string;
  page: number = 0;
  visits$: Observable<Visit[]>;
  searchTerm: string;
  loadingPatients: boolean;
  locationsUuids: string[] = [];
  paymentTypeSelected: string;

  @Output() selectPatient = new EventEmitter<any>();
  constructor(
    private visitService: VisitsService,
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnChanges() {}

  ngOnInit() {
    if (this.defaultFilter) {
      this.paymentTypeSelected = this.defaultFilter;
    }
    this.itemsPerPage = this.itemsPerPage ? this.itemsPerPage : 10;
    this.getVisits(this.visits);

    /**
     * TODO: find the best place to put this
     */
    this.visits$.pipe(take(1)).subscribe((visits) => {
      map(visits, (visit) => {
        if (
          visit['visit']?.location?.tags.some(
            (tag) => tag?.name === 'Bed Location'
          )
        ) {
          this.store.dispatch(
            upsertAdmittedPatientLocation({
              locationVisitDetails: {
                id: visit['visit']?.location?.uuid,
                locationId: visit['visit']?.location?.uuid,
                ...visit['visit'],
              },
            })
          );
        } else {
          this.store.dispatch(
            upsertAdmittedPatientLocation({
              locationVisitDetails: {},
            })
          );
        }
      });
    });
  }

  private getVisits(visits: Visit[]) {
    this.loadingPatients = true;
    this.visits$ = visits
      ? of(visits)
      : this.service && this.service === 'LABS'
      ? this.visitService.getLabVisits('', 0, this.itemsPerPage).pipe(
          tap(() => {
            this.loadingPatients = false;
          })
        )
      : this.visitService
          .getAllVisits(
            this.currentLocation,
            false,
            false,
            null,
            0,
            this.itemsPerPage,
            this.orderType,
            this.orderStatus,
            this.orderStatusCode
          )
          .pipe(
            tap(() => {
              this.loadingPatients = false;
            })
          );
  }

  getAnotherList(event: Event, visit, type): void {
    const details = {
      ...visit,
      type,
    };
    this.onLoadNewList(details);
  }

  onLoadNewList(details): void {
    this.loadingPatients = true;
    this.page =
      details?.type === 'next' ? Number(this.page) + 1 : Number(this.page) - 1;

    this.visits$ =
      this.service && this.service === 'LABS'
        ? this.visitService.getLabVisits('', this.page, this.itemsPerPage).pipe(
            tap(() => {
              this.loadingPatients = false;
            })
          )
        : this.visitService
            .getAllVisits(
              this.currentLocation,
              false,
              false,
              this.searchTerm,
              details.visit?.pager
                ? (details.visit?.pager.filter(
                    (pageLink) => pageLink?.rel === details?.type
                  ) || [])[0]?.uri?.split('&startIndex=')[1]
                : 0,
              this.itemsPerPage
            )
            .pipe(
              tap(() => {
                this.loadingPatients = false;
              })
            );
  }

  onSearchPatient(e) {
    e.stopPropagation();
    this.searchTerm = e?.target?.value;
    this.loadingPatients = true;
    this.visits$ = this.visitService
      .getAllVisits(
        this.currentLocation,
        false,
        false,
        this.searchTerm,
        0,
        this.itemsPerPage
      )
      .pipe(
        tap(() => {
          this.loadingPatients = false;
        })
      );
  }

  getLocationUuids(location) {
    this.locationsUuids = [...this.locationsUuids, location?.uuid];
    if (location?.childMembers && location?.childMembers?.length > 0) {
      location?.childMembers?.forEach((member) => {
        this.getLocationUuids(member);
      });
    }
    return uniq(this.locationsUuids);
  }

  onSelectPatient(e, visit: Visit) {
    if (e) {
      e.stopPropagation();
    }
    this.store.dispatch(clearBills());
    this.store.dispatch(clearBillItems());
    this.selectPatient.emit({ ...visit?.patient, visitUuid: visit?.uuid });
  }

  togglePatientTypeList(type) {
    const currentUrl = this.router.url.split('?')[0];
    const params = this.router.url.split('?')[1];
    this.isTabularList = type === 'tabular' ? true : false;
    this.store.dispatch(
      go({ path: [currentUrl], query: { queryParams: { list: type } } })
    );
  }

  getPaymentTypeSelected(event: Event, paymentType) {
    event.stopPropagation();
    this.paymentTypeSelected = '';
    setTimeout(() => {
      this.paymentTypeSelected = paymentType;
    }, 100);
  }

  onSearchAllPatient(event: Event) {
    event.stopPropagation();
    const patientListDialog = this.dialog.open(PatientListDialogComponent, {
      width: '800px',
    });

    patientListDialog
      .afterClosed()
      .subscribe((response: { action: string; patient: Patient }) => {
        if (response?.action === 'PATIENT_SELECT') {
          this.store.dispatch(clearBills());
          this.store.dispatch(clearBillItems());
          this.selectPatient.emit(response?.patient);
          // this.store.dispatch(
          //   addCurrentPatient({
          //     patient: response?.patient,
          //     isRegistrationPage: this.isRegistrationPage,
          //   })
          // );
        }
      });
  }
}